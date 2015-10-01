<?php

if (!defined('UT_DIR')) {
    define('UT_DIR', dirname(__FILE__) . '/../..');
}
require_once UT_DIR . '/IznikTest.php';
require_once IZNIK_BASE . '/include/mail/MailRouter.php';
require_once IZNIK_BASE . '/include/message/Message.php';

/**
 * @backupGlobals disabled
 * @backupStaticAttributes disabled
 */
class MailRouterTest extends IznikTest {
    private $dbhr, $dbhm;

    protected function setUp() {
        parent::setUp ();

        global $dbhr, $dbhm;
        $this->dbhr = $dbhr;
        $this->dbhm = $dbhm;

        # Tidy up any old test messages.
        $this->dbhm->preExec("DELETE FROM messages WHERE fromaddr = ? OR fromip = ?;", ['from@test.com', '1.2.3.4']);
        $this->dbhm->preExec("DELETE FROM messages_history WHERE fromaddr = ? OR fromip = ?;", ['from@test.com', '1.2.3.4']);
        $this->dbhm->preExec("DELETE FROM messages_history WHERE prunedsubject LIKE ?;", ['Test spam mail']);
        $this->dbhm->preExec("DELETE FROM messages_history WHERE fromaddr IN (?,?) OR fromip = ?;", ['test@test.com', 'GTUBE1.1010101@example.net', '1.2.3.4']);
        $this->dbhm->preExec("DELETE FROM groups WHERE nameshort LIKE 'testgroup%';", []);
        $this->dbhm->preExec("DELETE FROM users WHERE fullname = 'Test User';", []);

        # Whitelist this IP
        $this->dbhm->preExec("INSERT IGNORE INTO spam_whitelist_ips (ip, comment) VALUES ('1.2.3.4', 'UT whitelist');", []);
    }

    protected function tearDown() {
        parent::tearDown ();

        $this->dbhm->preExec("DELETE FROM spam_whitelist_ips WHERE ip = '1.2.3.4';", []);
        $this->dbhm->preExec("DELETE FROM messages_history WHERE fromip = '1.2.3.4';", []);
        $this->dbhm->preExec("DELETE FROM messages_history WHERE fromip = '4.3.2.1';", []);
    }

    public function __construct() {
    }

    public function testSpamSubject() {
        error_log(__METHOD__);

        $subj = "Test spam subject " . microtime();
        $groups = [];
        $r = new MailRouter($this->dbhr, $this->dbhm);

        for ($i = 0; $i < Spam::SUBJECT_THRESHOLD + 2; $i++) {
            $g = new Group($this->dbhr, $this->dbhm);
            $g->create("testgroup$i", Group::GROUP_REUSE);
            $groups[] = $g;

            $msg = file_get_contents('msgs/basic');
            $msg = str_replace('Basic test', $subj, $msg);
            $msg = str_replace('To: "freegleplayground@yahoogroups.com" <freegleplayground@yahoogroups.com>',
                    "To: \"testgroup$i\" <testgroup$i@yahoogroups.com>",
                    $msg);

            $r->received(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg);
            $rc = $r->route();

            if ($i < Spam::SUBJECT_THRESHOLD - 1) {
                assertEquals(MailRouter::APPROVED, $rc);
            } else {
                assertEquals(MailRouter::INCOMING_SPAM, $rc);
            }
        }

        foreach ($groups as $group) {
            $group->delete();
        }

        error_log(__METHOD__ . " end");
    }

    public function testSpam() {
        error_log(__METHOD__);

        $msg = file_get_contents('msgs/spam');
        $m = new Message($this->dbhr, $this->dbhm);
        $m->parse(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg);
        $id = $m->save();

        $m = new Message($this->dbhr, $this->dbhm, $id);
        assertEquals(Message::YAHOO_APPROVED, $m->getSource());

        $r = new MailRouter($this->dbhr, $this->dbhm, $id);
        $rc = $r->route();
        assertEquals(MailRouter::INCOMING_SPAM, $rc);

        $spam = new Message($this->dbhr, $this->dbhm, $id);
        assertEquals('sender@example.net', $spam->getFromaddr());
        assertNull($spam->getFromIP());
        assertNull($spam->getFromhost());
        assertEquals(0, count($spam->getGroups()));
        assertEquals($id, $spam->getID());
        assertEquals('GTUBE1.1010101@example.net', $spam->getMessageID());
        assertEquals($msg, $spam->getMessage());
        assertEquals(Message::YAHOO_APPROVED, $spam->getSource());
        assertEquals('from@test.com', $spam->getEnvelopefrom());
        assertEquals('to@test.com', $spam->getEnvelopeto());
        assertNotNull($spam->getTextbody());
        assertNull($spam->getHtmlbody());
        assertEquals($spam->getSubject(), $spam->getHeader('subject'));
        assertEquals('recipient@example.net', $spam->getTo()[0]['address']);
        assertEquals('Sender', $spam->getFromname());
        assertEquals('SpamAssassin flagged this as likely spam; score 1000 (high is bad)', $spam->getSpamReason());
        $spam->delete();

        error_log(__METHOD__ . " end");
    }

    public function testWhitelist() {
        error_log(__METHOD__);

        $msg = file_get_contents('msgs/spam');
        $msg = str_replace('Precedence: junk', 'X-Freegle-IP: 1.2.3.4', $msg);
        $m = new Message($this->dbhr, $this->dbhm);
        $m->parse(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg);
        $id = $m->save();

        $r = new MailRouter($this->dbhr, $this->dbhm, $id);
        $rc = $r->route();
        assertEquals(MailRouter::INCOMING_SPAM, $rc);

        error_log(__METHOD__ . " end");
    }

    public function testPending() {
        error_log(__METHOD__);

        $msg = file_get_contents('msgs/basic');
        $m = new Message($this->dbhr, $this->dbhm);
        $m->parse(Message::YAHOO_PENDING, 'from@test.com', 'to@test.com', $msg);
        $id = $m->save();

        $r = new MailRouter($this->dbhr, $this->dbhm, $id);
        $rc = $r->route();
        assertEquals(MailRouter::PENDING, $rc);
        
        $pend = new Message($this->dbhr, $this->dbhm, $id);
        assertEquals('test@test.com', $pend->getFromaddr());
        assertNull($pend->getFromIP()); # Because whitelisted IPs are masked out
        assertNull($pend->getFromhost());
        assertNotNull($pend->getGroups()[0]);
        assertEquals($id, $pend->getID());
        assertEquals('emff7a66f1-e0ed-4792-b493-17a75d806a30@edward-x1', $pend->getMessageID());
        assertEquals($msg, $pend->getMessage());
        assertEquals(Message::YAHOO_PENDING, $pend->getSource());
        assertEquals('from@test.com', $pend->getEnvelopefrom());
        assertEquals('to@test.com', $pend->getEnvelopeto());
        assertNotNull($pend->getTextbody());
        assertNotNull($pend->getHtmlbody());
        assertEquals($pend->getSubject(), $pend->getHeader('subject'));
        assertEquals('freegleplayground@yahoogroups.com', $pend->getTo()[0]['address']);
        assertEquals('Test User', $pend->getFromname());
        $pend->delete();

        error_log(__METHOD__ . " end");
    }

    function testPendingToApproved() {
        error_log(__METHOD__);

        $msg = file_get_contents('msgs/basic');
        $m = new Message($this->dbhr, $this->dbhm);
        $m->parse(Message::YAHOO_PENDING, 'from@test.com', 'to@test.com', $msg);
        $id = $m->save();

        $r = new MailRouter($this->dbhr, $this->dbhm, $id);
        $rc = $r->route();
        assertEquals(MailRouter::PENDING, $rc);
        assertNotNull(new Message($this->dbhr, $this->dbhm, $id));
        error_log("Pending id $id");

        $msg = file_get_contents('msgs/basic');
        $r = new MailRouter($this->dbhr, $this->dbhm);
        $r->received(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg);
        $rc = $r->route();
        assertEquals(MailRouter::APPROVED, $rc);
        assertNull((new Message($this->dbhr, $this->dbhm, $id))->getMessage());

        # Now the same, but with a TN post which has no messageid.
        error_log("Now TN post");
        $msg = file_get_contents('msgs/tn');
        $m = new Message($this->dbhr, $this->dbhm);
        $m->parse(Message::YAHOO_PENDING, 'from@test.com', 'to@test.com', $msg);
        assertEquals('20065945', $m->getTnpostid());
        assertEquals('TN-email', $m->getSourceheader());
        $id = $m->save();

        $r = new MailRouter($this->dbhr, $this->dbhm, $id);
        $rc = $r->route();
        assertEquals(MailRouter::PENDING, $rc);
        assertNotNull(new Message($this->dbhr, $this->dbhm, $id));
        error_log("Pending id $id");

        $msg = file_get_contents('msgs/tn');
        $r = new MailRouter($this->dbhr, $this->dbhm);
        $r->received(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg);
        $rc = $r->route();
        assertEquals(MailRouter::APPROVED, $rc);
        assertNull((new Message($this->dbhr, $this->dbhm, $id))->getMessage());

        error_log(__METHOD__ . " end");
    }

    function testTNSpamToApproved() {
        error_log(__METHOD__);

        # Force a TN message to spam
        $msg = file_get_contents('msgs/tn');
        $m = new Message($this->dbhr, $this->dbhm);
        $m->parse(Message::YAHOO_PENDING, 'from@test.com', 'to@test.com', $msg);
        $id = $m->save();

        $r = new MailRouter($this->dbhr, $this->dbhm, $id);
        $mock = $this->getMockBuilder('spamc')
            ->disableOriginalConstructor()
            ->setMethods(array('filter'))
            ->getMock();
        $mock->method('filter')->willReturn(true);
        $mock->result['SCORE'] = 100;
        $r->setSpamc($mock);
        $rc = $r->route();
        assertEquals(MailRouter::INCOMING_SPAM, $rc);
        assertNotNull(new Spam($this->dbhr, $this->dbhm, $id));
        error_log("Spam id $id");

        $msg = file_get_contents('msgs/tn');
        $r = new MailRouter($this->dbhr, $this->dbhm);

        $r->received(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg);
        $rc = $r->route();
        assertEquals(MailRouter::APPROVED, $rc);
        assertNull((new Message($this->dbhr, $this->dbhm, $id))->getMessage());

        error_log(__METHOD__ . " end");
    }

    public function testHam() {
        error_log(__METHOD__);

        $msg = file_get_contents('msgs/basic');
        $r = new MailRouter($this->dbhr, $this->dbhm);
        $r->received(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg);
        $rc = $r->route();
        assertEquals(MailRouter::APPROVED, $rc);

        $msg = file_get_contents('msgs/fromyahoo');
        $r = new MailRouter($this->dbhr, $this->dbhm);
        $id = $r->received(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg);
        $m = new Message($this->dbhr, $this->dbhm, $id);
        assertEquals('Yahoo-Web', $m->getSourceheader());
        $rc = $r->route();
        assertEquals(MailRouter::APPROVED, $rc);

        $msg = file_get_contents('msgs/basic');
        $r = new MailRouter($this->dbhr, $this->dbhm);
        $r->received(Message::YAHOO_PENDING, 'from@test.com', 'to@test.com', $msg);
        $rc = $r->route();
        assertEquals(MailRouter::PENDING, $rc);

        error_log(__METHOD__ . " end");
    }

    public function testSpamIP() {
        error_log(__METHOD__);

        # Sorry, Cameroon folk.
        $msg = file_get_contents('msgs/cameroon');

        $m = new Message($this->dbhr, $this->dbhm);
        $m->parse(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg);
        assertEquals('Yahoo-Email', $m->getSourceheader());
        $id = $m->save();

        $r = new MailRouter($this->dbhr, $this->dbhm, $id);
        $rc = $r->route();
        assertEquals(MailRouter::INCOMING_SPAM, $rc);

        # This should have stored the IP in the message.
        $m = new Message($this->dbhm, $this->dbhm, $id);
        assertEquals('41.205.16.153', $m->getFromIP());

        error_log(__METHOD__ . " end");
    }

    public function testFailSpam() {
        error_log(__METHOD__);

        $msg = file_get_contents('msgs/spam');

        # Make the attempt to mark as spam fail.
        $r = $this->getMockBuilder('MailRouter')
            ->setConstructorArgs(array($this->dbhr, $this->dbhm))
            ->setMethods(array('markAsSpam'))
            ->getMock();
        $r->method('markAsSpam')->willReturn(false);

        $r->received(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg);
        $rc = $r->route();
        assertEquals(MailRouter::FAILURE, $rc);

        # Make the spamc check itself fail
        $r = new MailRouter($this->dbhr, $this->dbhm);
        $mock = $this->getMockBuilder('spamc')
            ->disableOriginalConstructor()
            ->setMethods(array('filter'))
            ->getMock();
        $mock->method('filter')->willReturn(false);
        $r->setSpamc($mock);

        $r->received(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg);
        $rc = $r->route();
        assertEquals(MailRouter::FAILURE, $rc);

        # Make the geo lookup throw an exception, which it does for unknown IPs
        $msg = file_get_contents('msgs/basic');
        $msg = str_replace('X-Originating-IP: 1.2.3.4', 'X-Originating-IP: 238.162.112.228', $msg);
        $r = new MailRouter($this->dbhr, $this->dbhm);

        $r->received(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg);
        $rc = $r->route();
        assertEquals(MailRouter::APPROVED, $rc);

        error_log(__METHOD__ . " end");
    }

    public function testFailHam() {
        error_log(__METHOD__);

        $msg = file_get_contents('msgs/basic');

        # Make the attempt to mark the message as approved
        $r = $this->getMockBuilder('MailRouter')
            ->setConstructorArgs(array($this->dbhr, $this->dbhm))
            ->setMethods(array('markApproved', 'markPending'))
            ->getMock();
        $r->method('markApproved')->willReturn(false);
        $r->method('markPending')->willReturn(false);

        error_log("Expect markApproved fail");
        $r->received(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg);
        $rc = $r->route();
        assertEquals(MailRouter::FAILURE, $rc);

        $r->received(Message::YAHOO_PENDING, 'from@test.com', 'to@test.com', $msg);
        $rc = $r->route();
        assertEquals(MailRouter::FAILURE, $rc);

        # Make the spamc check itself fail
        $r = new MailRouter($this->dbhr, $this->dbhm);
        $mock = $this->getMockBuilder('spamc')
            ->disableOriginalConstructor()
            ->setMethods(array('filter'))
            ->getMock();
        $mock->method('filter')->willReturn(false);
        $r->setSpamc($mock);

        $r->received(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg);
        $rc = $r->route();
        assertEquals(MailRouter::FAILURE, $rc);

        error_log(__METHOD__ . " end");
    }

    public function testMultipleUsers() {
        error_log(__METHOD__);

        for ($i = 0; $i < Spam::USER_THRESHOLD + 2; $i++) {
            error_log("User $i");

            $msg = file_get_contents('msgs/basic');
            $msg = str_replace(
                'From: "Test User" <test@test.com>',
                'From: "Test User ' . $i . '" <test' . $i . '@test.com>',
                $msg);
            $msg = str_replace('1.2.3.4', '4.3.2.1', $msg);

            $r = new MailRouter($this->dbhr, $this->dbhm);
            $r->received(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg);
            $rc = $r->route();

            if ($i < Spam::USER_THRESHOLD) {
                assertEquals(MailRouter::APPROVED, $rc);
            } else {
                assertEquals(MailRouter::INCOMING_SPAM, $rc);
            }
        }

        error_log(__METHOD__ . " end");
    }

    public function testMultipleSubjects() {
        error_log(__METHOD__);

        $this->dbhm->exec("INSERT IGNORE INTO spam_whitelist_subjects (subject, comment) VALUES ('Basic test', 'For UT');");

        # Our subject is whitelisted and therefore should go through ok
        for ($i = 0; $i < Spam::SUBJECT_THRESHOLD + 2; $i++) {
            error_log("Group $i");
            $g = new Group($this->dbhr, $this->dbhm);
            $g->create("testgroup$i", Group::GROUP_REUSE);

            $msg = file_get_contents('msgs/basic');
            $msg = str_replace(
                'To: "freegleplayground@yahoogroups.com" <freegleplayground@yahoogroups.com>',
                'To: "testgroup' . $i . '@yahoogroups.com" <testgroup' . $i . '@yahoogroups.com>',
                $msg);

            $r = new MailRouter($this->dbhr, $this->dbhm);
            $r->received(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg);
            $rc = $r->route();

            assertEquals(MailRouter::APPROVED, $rc);
        }

        $this->dbhm->preExec("DELETE FROM messages_history WHERE fromip LIKE ?;", ['4.3.2.%']);

        # Now try with a non-whitelisted subject
        for ($i = 0; $i < Spam::SUBJECT_THRESHOLD + 2; $i++) {
            error_log("Group $i");

            $msg = file_get_contents('msgs/basic');
            $msg = str_replace('Subject: Basic test', 'Subject: Modified subject', $msg);
            $msg = str_replace(
                'To: "freegleplayground@yahoogroups.com" <freegleplayground@yahoogroups.com>',
                'To: "testgroup' . $i . '@yahoogroups.com" <testgroup' . $i . '@yahoogroups.com>',
                $msg);

            $r = new MailRouter($this->dbhr, $this->dbhm);
            $r->received(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg);
            $rc = $r->route();

            if ($i + 1 < Spam::SUBJECT_THRESHOLD) {
                assertEquals(MailRouter::APPROVED, $rc);
            } else {
                assertEquals(MailRouter::INCOMING_SPAM, $rc);
            }
        }

        $this->dbhm->preExec("DELETE FROM messages_history WHERE fromip LIKE ?;", ['4.3.2.%']);

        error_log(__METHOD__ . " end");
    }

    public function testMultipleGroups() {
        error_log(__METHOD__);

        for ($i = 0; $i < Spam::GROUP_THRESHOLD + 2; $i++) {
            error_log("Group $i");

            $msg = file_get_contents('msgs/basic');

            $msg = str_replace(
                'To: "freegleplayground@yahoogroups.com" <freegleplayground@yahoogroups.com>',
                'To: "freegleplayground' . $i . '@yahoogroups.com" <freegleplayground' . $i . '@yahoogroups.com>',
                $msg);
            $msg = str_replace('1.2.3.4', '4.3.2.1', $msg);

            $r = new MailRouter($this->dbhr, $this->dbhm);
            $r->received(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg);
            $rc = $r->route();

            if ($i < Spam::GROUP_THRESHOLD) {
                assertEquals(MailRouter::APPROVED, $rc);
            } else {
                assertEquals(MailRouter::INCOMING_SPAM, $rc);
            }
        }

        error_log(__METHOD__ . " end");
    }

    function testRouteAll() {
        error_log(__METHOD__);

        $msg = file_get_contents('msgs/basic');

        $m = new Message($this->dbhr, $this->dbhm);
        $m->parse(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg);
        assertNotNull($m->getGroupId());
        $id = $m->save();
        error_log("Set up id $id");

        $r = new MailRouter($this->dbhr, $this->dbhm);
        $r->routeAll();

        # Force exception
        error_log("Now force exception");
        $msg = file_get_contents('msgs/basic');
        $r = new MailRouter($this->dbhr, $this->dbhm);
        $m = new Message($this->dbhr, $this->dbhm);
        $m->parse(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg);
        $m->save();

        $mock = $this->getMockBuilder('LoggedPDO')
            ->disableOriginalConstructor()
            ->setMethods(array('preExec', 'rollBack', 'beginTransaction'))
            ->getMock();
        $mock->method('preExec')->will($this->throwException(new Exception()));
        $mock->method('rollBack')->willReturn(true);
        $mock->method('beginTransaction')->willReturn(true);
        $r->setDbhm($mock);
        $r->routeAll();

        error_log(__METHOD__ . " end");
    }


}

