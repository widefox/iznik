<?php

require_once(IZNIK_BASE . '/include/utils.php');
require_once(IZNIK_BASE . '/include/message/Message.php');
require_once(IZNIK_BASE . '/include/misc/Log.php');
require_once(IZNIK_BASE . '/include/group/Group.php');
require_once(IZNIK_BASE . '/mailtemplates/digest/single.php');
require_once(IZNIK_BASE . '/mailtemplates/digest/multiple.php');
require_once(IZNIK_BASE . '/mailtemplates/digest/message.php');
require_once(IZNIK_BASE . '/mailtemplates/digest/off.php');

class Digest
{
    /** @var  $dbhr LoggedPDO */
    private $dbhr;
    /** @var  $dbhm LoggedPDO */
    private $dbhm;

    const NEVER = 0;
    const IMMEDIATE = -1;
    const HOUR1 = 1;
    const HOUR2 = 2;
    const HOUR4 = 4;
    const HOUR8 = 8;
    const DAILY = 24;

    function __construct($dbhr, $dbhm, $id = NULL)
    {
        $this->dbhr = $dbhr;
        $this->dbhm = $dbhm;
        $this->log = new Log($this->dbhr, $this->dbhm);
        
        $this->freqText = [
            Digest::NEVER => 'never',
            Digest::IMMEDIATE => 'immediately',
            Digest::HOUR1 => 'every hour',
            Digest::HOUR2 => 'every two hours',
            Digest::HOUR4 => 'every four hours',
            Digest::HOUR8 => 'every eight hours',
            Digest::DAILY => 'daily'
        ];
    }

    # Split out for UT to override
    public function sendOne($mailer, $message) {
        $mailer->send($message);
    }

    public function off($uid, $groupid) {
        $u = new User($this->dbhr, $this->dbhm, $uid);
        $u->setMembershipAtt($groupid, 'emailallowed', 0);
        $g = new Group($this->dbhr, $this->dbhm, $groupid);
        $groupname = $g->getPublic()['namedisplay'];

        $this->log->log([
            'type' => Log::TYPE_USER,
            'subtype' => Log::SUBTYPE_MAILOFF,
            'userid' => $uid,
            'groupid' => $groupid
        ]);

        $emails = $u->getEmails();
        if (count($emails) > 0) {
            $spool = new Swift_FileSpool(IZNIK_BASE . "/spool");
            $spooltrans = Swift_SpoolTransport::newInstance($spool);
            $smtptrans = Swift_SmtpTransport::newInstance("localhost");
            $transport = Swift_FailoverTransport::newInstance([
                $smtptrans,
                $spooltrans
            ]);

            $mailer = Swift_Mailer::newInstance($transport);

            $html = digest_off(USER_DOMAIN, USERLOGO, $groupname);

            $message = Swift_Message::newInstance()
                ->setSubject("Email Change Confirmation")
                ->setFrom([NOREPLY_ADDR => 'Do Not Reply'])
                ->setReturnPath('bounce@direct.ilovefreegle.org')
                ->setTo([ $emails[0]['email'] => $u->getName() ])
                ->setBody("We've turned your emails off on $groupname.")
                ->addPart($html, 'text/html');

            $this->sendOne($mailer, $message);
        }
    }

    public function send($groupid, $frequency) {
        $g = new Group($this->dbhr, $this->dbhm, $groupid);
        $gatts = $g->getPublic();
        $sent = 0;

        # TODO until we migrate over, we need to link to the old site, so we need the old group id.
        $fdgroupid = NULL;
        global $dbconfig;
        $dsn = "mysql:host={$dbconfig['host']};port={$dbconfig['port']};dbname=republisher;charset=utf8";

        $dbhold = new PDO($dsn, $dbconfig['user'], $dbconfig['pass'], array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => FALSE
        ));
        $sql = "SELECT groupid FROM groups WHERE groupname = " . $dbhold->quote($gatts['nameshort']) . ";";
        $fdgroups = $dbhold->query($sql);
        foreach ($fdgroups as $fdgroup) {
            $fdgroupid = $fdgroup['groupid'];
        }

        if ($fdgroupid) {
            error_log("#$groupid " . $g->getPrivate('nameshort') . " send emails for $frequency");

            # Make sure we have a tracking entry.
            $sql = "INSERT IGNORE INTO groups_digests (groupid, frequency) VALUES (?, ?);";
            $this->dbhm->preExec($sql, [ $groupid, $frequency ]);

            $sql = "SELECT * FROM groups_digests WHERE groupid = ? AND frequency = ?;";
            $tracks = $this->dbhr->preQuery($sql, [ $groupid, $frequency ]);
            foreach ($tracks as $track) {
                $sql = "UPDATE groups_digests SET started = NOW() WHERE groupid = ? AND frequency = ?;";
                $this->dbhm->preExec($sql, [$groupid, $frequency]);

                # Find the cut-off time for the earliest message we want to include.  If we've not sent anything for this
                # group/frequency before then ensure we don't send anything older than a day.
                $oldest = " AND arrival >= '" . date("Y-m-d H:i:s", strtotime("24 hours ago")) . "'";
                $msgidq = $track['msgid'] ? " AND msgid > {$track['msgid']} " : '';

                $sql = "SELECT msgid, yahooapprovedid FROM messages_groups WHERE groupid = ? AND collection = ? AND deleted = 0 $oldest $msgidq ORDER BY msgid ASC;";
                $messages = $this->dbhr->preQuery($sql, [
                    $groupid,
                    MessageCollection::APPROVED,
                ]);

                $subjects = [];
                $available = [];
                $unavailable = [];
                $maxmsg = 0;

                foreach ($messages as $message) {
                    $maxmsg = max($maxmsg, $message['msgid']);

                    $m = new Message($this->dbhr, $this->dbhm, $message['msgid']);
                    $subjects[$message['msgid']] = $m->getSubject();

                    $atts = $m->getPublic(FALSE, TRUE, TRUE);

                    # Strip out the clutter associated with various ways of posting.
                    $atts['textbody'] = $m->stripGumf();

                    # We need the approved ID on Yahoo for migration links.
                    # TODO remove in time.
                    $atts['yahooapprovedid'] = NULL;
                    $groups = $atts['groups'];
                    foreach ($groups as $group) {
                        if ($group['groupid'] == $groupid) {
                            $atts['yahooapprovedid'] = $group['yahooapprovedid'];
                        }
                    }

                    if ($atts['type'] == Message::TYPE_OFFER || $atts['type'] == Message::TYPE_WANTED) {
                        if (count($atts['related']) == 0) {
                            $available[] = $atts;
                        } else {
                            $unavailable[] = $atts;
                        }
                    }
                }

                # Build the array of message(s) to send.  If we are sending immediately this may have multiple,
                # otherwise it'll just be one.
                $tosend = [];

                if ($frequency == Digest::IMMEDIATE) {
                    foreach ($available as $msg) {
                        # For immediate messages, which we send out as they arrive, we can set them to reply to
                        # the original sender.  We include only the text body of the message, because we
                        # wrap it up inside our own HTML.
                        #
                        # Anything that is per-group is passed in as a parameter here.  Anything that is or might
                        # become per-user is in the template as a {{...}} substitution.
                        $msghtml = digest_message($msg, $msg['yahooapprovedid'], $fdgroupid);
                        $html = digest_single($msghtml,
                            USER_DOMAIN,
                            USERLOGO,
                            $gatts['namedisplay'],
                            $msg['subject'],
                            $msg['fromname'],
                            $msg['fromaddr']
                        );

                        $tosend[] = [
                            'subject' => '[' . $gatts['namedisplay'] . "] {$msg['subject']}",
                            'from' => $msg['fromaddr'],
                            'fromname' => $msg['fromname'],
                            'replyto' => $msg['fromaddr'],
                            'replytoname' => $msg['fromname'],
                            'html' => $html,
                            'text' => $msg['textbody']
                        ];
                    }
                } else {
                    # Build up the HTML for the message(s) in it.  We add a teaser of items to make it more
                    # interesting.
                    $textsumm = '';
                    $availablehtml = '';
                    $availablesumm = '';
                    $subject = "[{$gatts['namedisplay']}] What's New (" . count($available) . " message" .
                        (count($available) == 1 ? ')' : 's)');
                    $subjinfo = '';

                    foreach ($available as $msg) {
                        $availablehtml .= $msghtml = digest_message($msg, $msg['yahooapprovedid'], $fdgroupid);
                        $textsumm .= $msg['subject'] . ":\r\nhttps://direct.ilovefreegle.org/login.php?action=mygroups&subaction=displaypost&msgid={$msg['id']}&groupid=$fdgroupid&digest=$fdgroupid\r\n\r\n";
                        $availablesumm .= $msg['subject'] . '<br />';

                        if (preg_match("/(.+)\:(.+)\((.+)\)/", $msg['subject'], $matches)) {
                            $item = trim($matches[2]);

                            if (strlen($item) < 25 && strlen($subjinfo) < 50) {
                                $subjinfo = $subjinfo == '' ? $item : "$subjinfo, $item";
                            }
                        }
                    }

                    if ($subjinfo) {
                        $subject .= " - $subjinfo";
                    }

                    $unavailablehtml = '';

                    foreach ($unavailable as $msg) {
                        $unavailablehtml .= digest_message($msg, $msg['yahooapprovedid'], $fdgroupid);
                        $textsumm .= $msg['subject'] . " (post completed, no longer active)\r\n";
                    }

                    $html = digest_multiple($availablehtml,
                        $availablesumm,
                        $unavailablehtml,
                        USER_DOMAIN,
                        USERLOGO,
                        $gatts['namedisplay'],
                        $subject,
                        $gatts['namedisplay'],
                        $g->getModsEmail()
                    );

                    $tosend[] = [
                        'subject' => $subject,
                        'from' => $g->getModsEmail(),
                        'fromname' => $gatts['namedisplay'],
                        'replyto' => $g->getModsEmail(),
                        'replytoname' => $gatts['namedisplay'],
                        'html' => $html,
                        'text' => $textsumm
                    ];
                }

                error_log("Got " . count($tosend) . " messages max $maxmsg");
                if ($maxmsg > 0) {
                    # Now find the users we want to send to on this group for this frequency.  We build up an array of
                    # the substitutions we need.
                    # TODO This isn't that well indexed in the table.
                    $replacements = [];

                    $sql = "SELECT userid FROM memberships WHERE groupid = ? AND emailallowed = 1 AND emailfrequency = ? ORDER BY userid ASC;";
                    $users = $this->dbhr->preQuery($sql,
                        [ $groupid, $frequency ]);

                    foreach ($users as $user) {
                        $u = new User($this->dbhr, $this->dbhm, $user['userid']);
                        $emails = $u->getEmails();

                        if (count($emails) > 0) {
                            $email = $emails[0]['email'];
                            $membershipmail = $u->getEmailForYahooGroup($groupid);

                            # We don't want to send out mails to users who are members directly on Yahoo, only
                            # for ones which have joined through this platform or its predecessor.
                            if (stripos($membershipmail, USER_DOMAIN) !== FALSE ||
                                stripos($membershipmail, 'fbuser') !== FALSE) {
                                error_log("...$email");

                                # TODO These are the replacements for the mails sent before FDv2 is retired.  These will change.
                                $replacements[$email] = [
                                    '{{toname}}' => $u->getName(),
                                    '{{unsubscribe}}' => 'https://direct.ilovefreegle.org/unsubscribe.php?email=' . urlencode($email),
                                    '{{email}}' => $email,
                                    '{{frequency}}' => $this->freqText[$frequency],
                                    '{{noemail}}' => 'digestoff-' . $user['userid'] . "-$groupid@" . USER_DOMAIN,
                                    '{{post}}' => "https://direct.ilovefreegle.org/login.php?action=post&groupid=$groupid&digest=$groupid",
                                    '{{visit}}' => "https://direct.ilovefreegle.org/login.php?action=mygroups&subaction=displaygroup&groupid=$groupid&digest=$groupid"
                                ];
                            }
                        }
                    }

                    error_log("Got " . count($replacements) . " users");
                    if (count($replacements) > 0) {
                        # Now send.  We use a failover transport so that if we fail to send, we'll queue it for later
                        # rather than lose it.
                        $spool = new Swift_FileSpool(IZNIK_BASE . "/spool");
                        $spooltrans = Swift_SpoolTransport::newInstance($spool);
                        $smtptrans = Swift_SmtpTransport::newInstance("localhost");
                        $transport = Swift_FailoverTransport::newInstance([
                            $smtptrans,
                            $spooltrans
                        ]);

                        $mailer = Swift_Mailer::newInstance($transport);

                        # We're decorating using the information we collected earlier.  So we create one copy of
                        # the message, with replacement strings, and many recipients.
                        $decorator = new Swift_Plugins_DecoratorPlugin($replacements);
                        $mailer->registerPlugin($decorator);

                        # We don't want to send mails with too many recipients.  This plugin breaks it up.
                        $mailer->registerPlugin(new Swift_Plugins_AntiFloodPlugin(900));

                        $_SERVER['SERVER_NAME'] = USER_DOMAIN;
                        foreach ($tosend as $msg) {
                            $message = Swift_Message::newInstance()
                                ->setSubject($msg['subject'])
                                ->setFrom([$msg['from'] => $msg['fromname']])
                                ->setReturnPath('bounce@direct.ilovefreegle.org')
                                ->setReplyTo($msg['replyto'], $msg['replytoname'])
                                ->setBody($msg['text'])
                                ->addPart($msg['html'], 'text/html');
                            $headers = $message->getHeaders();
                            $headers->addTextHeader('List-Unsubscribe', '<mailto:{{unsubscribe}}>');

                            foreach ($replacements as $email => $rep) {
                                $message->addBcc($email, $rep['{{toname}}']);
                            }

                            $this->sendOne($mailer, $message);
                        }

                        $sent += count($tosend);
                    }

                    if ($maxmsg > 0) {
                        # Record the message we got upto.
                        $sql = "UPDATE groups_digests SET msgid = ? WHERE groupid = ? AND frequency = ?;";
                        $this->dbhm->preExec($sql, [$maxmsg, $groupid, $frequency]);
                    }

                    $sql = "UPDATE groups_digests SET ended = NOW() WHERE groupid = ? AND frequency = ?;";
                    $this->dbhm->preExec($sql, [$groupid, $frequency]);
                }
            }
        }
 
        return($sent);
    }
}