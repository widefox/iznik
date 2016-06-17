<?php

if (!defined('UT_DIR')) {
    define('UT_DIR', dirname(__FILE__) . '/../..');
}
require_once UT_DIR . '/IznikTestCase.php';
require_once IZNIK_BASE . '/include/user/User.php';
require_once IZNIK_BASE . '/include/group/Group.php';
require_once IZNIK_BASE . '/include/mail/Digest.php';
require_once IZNIK_BASE . '/include/mail/MailRouter.php';

/**
 * @backupGlobals disabled
 * @backupStaticAttributes disabled
 */
class digestTest extends IznikTestCase {
    private $dbhr, $dbhm;

    private $msgsSent = [];

    protected function setUp()
    {
        parent::setUp();

        global $dbhr, $dbhm;
        $this->dbhr = $dbhr;
        $this->dbhm = $dbhm;

        $this->msgsSent = [];

        $this->tidy();
    }

    public function sendMock($mailer, $message) {
        $this->msgsSent[] = $message->toString();
    }

    public function testImmediate() {
        error_log(__METHOD__);

        # Mock the actual send
        $mock = $this->getMockBuilder('Digest')
            ->setConstructorArgs([$this->dbhm, $this->dbhm])
            ->setMethods(array('sendOne'))
            ->getMock();
        $mock->method('sendOne')->will($this->returnCallback(function($mailer, $message) {
            return($this->sendMock($mailer, $message));
        }));

        # Create a group with a message on it.
        $g = new Group($this->dbhr, $this->dbhm);
        $gid = $g->create("testgroup", Group::GROUP_REUSE);
        $msg = $this->unique(file_get_contents('msgs/basic'));
        $msg = str_replace("FreeglePlayground", "testgroup", $msg);
        $msg = str_replace('Basic test', 'OFFER: Test item (location)', $msg);
        $msg = str_replace("Hey", "Hey {{username}}", $msg);

        $r = new MailRouter($this->dbhr, $this->dbhm);
        $id = $r->received(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg, $gid);
        assertNotNull($id);
        error_log("Created message $id");
        $rc = $r->route();
        assertEquals(MailRouter::APPROVED, $rc);

        # Create a user on that group who wants immediate delivery.
        $u = new User($this->dbhr, $this->dbhm);
        $uid = $u->create(NULL, NULL, 'Test User');
        $u->addMembership($gid);
        $u->setMembershipAtt($gid, 'emailfrequency', Digest::IMMEDIATE);
        $u->setMembershipAtt($gid, 'emailallowed', 1);
        assertGreaterThan(0, $u->addEmail('test@' . USER_DOMAIN));

        # Now test.
        assertEquals(1, $mock->send($gid, Digest::IMMEDIATE));
        assertEquals(1, count($this->msgsSent));

        error_log(__METHOD__ . " end");
    }

    public function testSend() {
        error_log(__METHOD__);

        # Actual send for coverage.
        $d = new Digest($this->dbhr, $this->dbhm);

        # Create a group with a message on it.
        $g = new Group($this->dbhr, $this->dbhm);
        $gid = $g->create("testgroup", Group::GROUP_REUSE);
        $msg = $this->unique(file_get_contents('msgs/basic'));
        $msg = str_replace("FreeglePlayground", "testgroup", $msg);
        $msg = str_replace('Basic test', 'OFFER: Test item (location)', $msg);
        $msg = str_replace("Hey", "Hey {{username}}", $msg);

        $r = new MailRouter($this->dbhr, $this->dbhm);
        $id = $r->received(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg, $gid);
        assertNotNull($id);
        error_log("Created message $id");
        $rc = $r->route();
        assertEquals(MailRouter::APPROVED, $rc);

        # Create a user on that group who wants immediate delivery.
        $u = new User($this->dbhr, $this->dbhm);
        $uid = $u->create(NULL, NULL, 'Test User');
        $u->addMembership($gid);
        $u->setMembershipAtt($gid, 'emailfrequency', Digest::IMMEDIATE);
        $u->setMembershipAtt($gid, 'emailallowed', 1);
        assertGreaterThan(0, $u->addEmail('test@' . USER_DOMAIN));

        # Now test.
        assertEquals(1, $d->send($gid, Digest::IMMEDIATE));

        # Again - nothing to send.
        assertEquals(0, $d->send($gid, Digest::IMMEDIATE));

        error_log(__METHOD__ . " end");
    }

    public function testMultiple() {
        error_log(__METHOD__);

        # Mock the actual send
        $mock = $this->getMockBuilder('Digest')
            ->setConstructorArgs([$this->dbhr, $this->dbhm])
            ->setMethods(array('sendOne'))
            ->getMock();
        $mock->method('sendOne')->will($this->returnCallback(function($mailer, $message) {
            return($this->sendMock($mailer, $message));
        }));

        # Create a group with two messages on it, one taken.
        $g = new Group($this->dbhr, $this->dbhm);
        $gid = $g->create("testgroup", Group::GROUP_REUSE);

        $msg = $this->unique(file_get_contents('msgs/basic'));
        $msg = str_replace("FreeglePlayground", "testgroup", $msg);
        $msg = str_replace('Basic test', 'OFFER: Test item (location)', $msg);
        $r = new MailRouter($this->dbhr, $this->dbhm);
        $id = $r->received(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg, $gid);
        assertNotNull($id);
        error_log("Created message $id");
        $rc = $r->route();
        assertEquals(MailRouter::APPROVED, $rc);

        $msg = $this->unique(file_get_contents('msgs/basic'));
        $msg = str_replace("FreeglePlayground", "testgroup", $msg);
        $msg = str_replace('Basic test', 'OFFER: Test thing (location)', $msg);
        $r = new MailRouter($this->dbhr, $this->dbhm);
        $id = $r->received(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg, $gid);
        assertNotNull($id);
        error_log("Created message $id");
        $rc = $r->route();
        assertEquals(MailRouter::APPROVED, $rc);

        $msg = $this->unique(file_get_contents('msgs/basic'));
        $msg = str_replace("FreeglePlayground", "testgroup", $msg);
        $msg = str_replace('Basic test', 'TAKEN: Test item (location)', $msg);
        $r = new MailRouter($this->dbhr, $this->dbhm);
        $id = $r->received(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg, $gid);
        assertNotNull($id);
        error_log("Created message $id");
        $rc = $r->route();
        assertEquals(MailRouter::APPROVED, $rc);

        # Create a user on that group who wants digest.
        $u = new User($this->dbhr, $this->dbhm);
        $uid = $u->create(NULL, NULL, 'Test User');
        $u->addMembership($gid);
        $u->setMembershipAtt($gid, 'emailfrequency', Digest::HOUR1);
        $u->setMembershipAtt($gid, 'emailallowed', 1);
        assertGreaterThan(0, $u->addEmail('test@' . USER_DOMAIN));

        # Now test.
        assertEquals(1, $mock->send($gid, Digest::HOUR1));
        assertEquals(1, count($this->msgsSent));
        
        # Again - nothing to send.
        assertEquals(0, $mock->send($gid, Digest::HOUR1));

        error_log(__METHOD__ . " end");
    }
}
