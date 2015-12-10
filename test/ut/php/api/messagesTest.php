<?php

if (!defined('UT_DIR')) {
    define('UT_DIR', dirname(__FILE__) . '/../..');
}
require_once UT_DIR . '/IznikAPITest.php';
require_once IZNIK_BASE . '/include/user/User.php';
require_once IZNIK_BASE . '/include/group/Group.php';
require_once IZNIK_BASE . '/include/mail/MailRouter.php';
require_once IZNIK_BASE . '/include/message/Collection.php';

/**
 * @backupGlobals disabled
 * @backupStaticAttributes disabled
 */
class messagesTest extends IznikAPITest {
    public $dbhr, $dbhm;

    protected function setUp() {
        parent::setUp ();

        global $dbhr, $dbhm;
        $this->dbhr = $dbhr;
        $this->dbhm = $dbhm;

        $dbhm->preExec("DELETE FROM users WHERE fullname = 'Test User';");
        $dbhm->preExec("DELETE FROM groups WHERE nameshort = 'testgroup';");
    }

    protected function tearDown() {
        parent::tearDown ();
    }

    public function __construct() {
    }

    public function testApproved() {
        error_log(__METHOD__);

        $g = new Group($this->dbhr, $this->dbhm);
        $group1 = $g->create('testgroup', Group::GROUP_REUSE);

        # Create a group with a message on it
        $msg = file_get_contents('msgs/basic');
        $msg = str_ireplace('freegleplayground', 'testgroup', $msg);
        $r = new MailRouter($this->dbhr, $this->dbhm);
        $id = $r->received(Message::YAHOO_APPROVED, 'from@test.com', 'to@test.com', $msg);
        $rc = $r->route();
        assertEquals(MailRouter::APPROVED, $rc);
        error_log("Approved id $id");

        $c = new Collection($this->dbhr, $this->dbhm, Collection::APPROVED);
        $a = new Message($this->dbhr, $this->dbhm, $id);

        # Should be able to see this message even logged out.
        $ret = $this->call('messages', 'GET', [
            'groupid' => $group1
        ]);
        error_log(var_export($ret, true));
        assertEquals(0, $ret['ret']);
        $msgs = $ret['messages'];
        assertEquals(1, count($msgs));
        assertEquals($a->getID(), $msgs[0]['id']);
        assertFalse(array_key_exists('source', $msgs[0])); # Only a member, shouldn't see mod att

        # Now join and check we can see see it.
        $u = new User($this->dbhr, $this->dbhm);
        $id = $u->create(NULL, NULL, 'Test User');
        $u = new User($this->dbhr, $this->dbhm, $id);
        $u->addMembership($group1);
        assertGreaterThan(0, $u->addLogin(User::LOGIN_NATIVE, NULL, 'testpw'));
        assertTrue($u->login('testpw'));

        $ret = $this->call('messages', 'GET', [
        ]);
        assertEquals(0, $ret['ret']);
        $msgs = $ret['messages'];
        assertEquals(1, count($msgs));
        assertEquals($a->getID(), $msgs[0]['id']);
        assertFalse(array_key_exists('source', $msgs[0])); # Only a member, shouldn't see mod att

        # Check the log.
        $u->setRole(User::ROLE_MODERATOR, $group1);

        error_log("Fromuser is " . $a->getFromuser());
        $ret = $this->call('user', 'GET', [
            'id' => $a->getFromuser(),
            'logs' => TRUE
        ]);
        error_log("Logs".  var_export($ret, true));
        $log = $this->findLog('Message', 'Received', $ret['user']['logs']);
        assertEquals($group1, $log['group']['id']);
        assertEquals($a->getFromuser(), $log['user']['id']);

        $a->delete();

        error_log(__METHOD__ . " end");
    }

    public function testSpam() {
        error_log(__METHOD__);

        $g = new Group($this->dbhr, $this->dbhm);
        $group1 = $g->create('testgroup', Group::GROUP_REUSE);

        # Create a group with a message on it
        $msg = file_get_contents('msgs/spam');
        $msg = str_ireplace('To: Recipient <recipient@example.net>', 'To: "testgroup@yahoogroups.com" <testgroup@yahoogroups.com>', $msg);
        $r = new MailRouter($this->dbhr, $this->dbhm);
        $id = $r->received(Message::YAHOO_PENDING, 'from@test.com', 'to@test.com', $msg);
        $rc = $r->route();
        assertEquals(MailRouter::INCOMING_SPAM, $rc);

        $c = new Collection($this->dbhr, $this->dbhm, Collection::SPAM);
        $a = new Message($this->dbhr, $this->dbhm, $id);

        # Shouldn't be able to see spam
        $ret = $this->call('messages', 'GET', [
            'groupid' => $group1,
            'collection' => 'Spam'
        ]);

        assertEquals(0, $ret['ret']);
        $msgs = $ret['messages'];
        assertEquals(0, count($msgs));

        # Now join - shouldn't be able to see a spam message
        $u = new User($this->dbhr, $this->dbhm);
        $id = $u->create(NULL, NULL, 'Test User');
        $u = new User($this->dbhr, $this->dbhm, $id);
        $u->addMembership($group1);

        $ret = $this->call('messages', 'GET', [
            'groupid' => $group1,
            'collection' => 'Spam'
        ]);
        assertEquals(0, $ret['ret']);
        $msgs = $ret['messages'];
        assertEquals(0, count($msgs));

        # Promote to owner - should be able to see it.
        $u->setRole(User::ROLE_OWNER, $group1);
        assertEquals(User::ROLE_OWNER, $u->getRole($group1));
        assertGreaterThan(0, $u->addLogin(User::LOGIN_NATIVE, NULL, 'testpw'));
        assertTrue($u->login('testpw'));
        $ret = $this->call('messages', 'GET', [
            'groupid' => $group1,
            'collection' => 'Spam',
            'start' => '2100-01-01T06:00:00Z'
        ]);
        assertEquals(0, $ret['ret']);
        $msgs = $ret['messages'];
        assertEquals(1, count($msgs));
        assertEquals($a->getID(), $msgs[0]['id']);
        error_log(var_export($msgs, true));
        assertTrue(array_key_exists('source', $msgs[0])); # An owner, should see mod att

        $a->delete();

        error_log(__METHOD__ . " end");
    }

    public function testError() {
        error_log(__METHOD__);

        $ret = $this->call('messages', 'GET', [
            'groupid' => 0,
            'collection' => 'wibble'
        ]);
        assertEquals(0, $ret['ret']);
        assertEquals(0, count($ret['messages']));

        error_log(__METHOD__ . " end");
    }

    public function testPending() {
        error_log(__METHOD__);

        $g = new Group($this->dbhr, $this->dbhm);
        $group1 = $g->create('testgroup', Group::GROUP_REUSE);

        # Create a group with a message on it
        $msg = file_get_contents('msgs/basic');
        $msg = str_ireplace('freegleplayground', 'testgroup', $msg);
        $r = new MailRouter($this->dbhr, $this->dbhm);
        $id = $r->received(Message::YAHOO_PENDING, 'from@test.com', 'to@test.com', $msg);
        $rc = $r->route();
        assertEquals(MailRouter::PENDING, $rc);

        $c = new Collection($this->dbhr, $this->dbhm, Collection::PENDING);
        $a = new Message($this->dbhr, $this->dbhm, $id);

        # Shouldn't be able to see pending
        $ret = $this->call('messages', 'GET', [
            'groupid' => $group1,
            'collection' => 'Pending'
        ]);

        assertEquals(0, $ret['ret']);
        $msgs = $ret['messages'];
        assertEquals(0, count($msgs));

        # Now join - shouldn't be able to see a pending message
        $u = new User($this->dbhr, $this->dbhm);
        $id = $u->create(NULL, NULL, 'Test User');
        $u = new User($this->dbhr, $this->dbhm, $id);
        $u->addMembership($group1);
        assertGreaterThan(0, $u->addLogin(User::LOGIN_NATIVE, NULL, 'testpw'));
        assertTrue($u->login('testpw'));

        $ret = $this->call('messages', 'GET', [
            'groupid' => $group1,
            'collection' => 'Pending'
        ]);
        assertEquals(0, $ret['ret']);
        $msgs = $ret['messages'];
        assertEquals(0, count($msgs));

        # Promote to mod - should be able to see it.
        $u->setRole(User::ROLE_MODERATOR, $group1);
        assertEquals(User::ROLE_MODERATOR, $u->getRole($group1));
        $ret = $this->call('messages', 'GET', [
            'groupid' => $group1,
            'collection' => 'Pending'
        ]);
        assertEquals(0, $ret['ret']);
        $msgs = $ret['messages'];
        assertEquals(1, count($msgs));
        assertEquals($a->getID(), $msgs[0]['id']);
        assertEquals($group1, $msgs[0]['groups'][0]['groupid']);
        assertTrue(array_key_exists('source', $msgs[0])); # A mod, should see mod att

        $a->delete();

        error_log(__METHOD__ . " end");
    }

    public function testPut() {
        error_log(__METHOD__ . " start");

        $g = new Group($this->dbhr, $this->dbhm);
        $group1 = $g->create('testgroup', Group::GROUP_REUSE);
        $msg = file_get_contents('msgs/basic');

        $ret = $this->call('messages', 'PUT', [
            'groupid' => $group1,
            'source' => Message::YAHOO_PENDING,
            'from' => 'test@test.com',
            'yahoopendingid' => 833,
            'message' => $msg
        ]);

        # Should fail - not a mod
        assertEquals(2, $ret['ret']);

        $u = new User($this->dbhr, $this->dbhm);
        $uid = $u->create(NULL, NULL, 'Test User');
        $u = new User($this->dbhr, $this->dbhm, $uid);
        $u->addMembership($group1, User::ROLE_MODERATOR);
        assertGreaterThan(0, $u->addLogin(User::LOGIN_NATIVE, NULL, 'testpw'));
        assertTrue($u->login('testpw'));

        $ret = $this->call('messages', 'PUT', [
            'groupid' => $group1,
            'source' => Message::YAHOO_PENDING,
            'from' => 'test@test.com',
            'yahoopendingid' => 833,
            'message' => $msg
        ]);

        # Should work
        assertEquals(0, $ret['ret']);
        assertEquals(MailRouter::PENDING, $ret['routed']);

        # Should fail - invalid source
        $ret = $this->call('messages', 'PUT', [
            'groupid' => $group1,
            'source' => 'wibble',
            'from' => 'test@test.com',
            'yahooapprovedid' => 833,
            'message' => $msg
        ]);

        assertEquals(997, $ret['ret']);

        $ret = $this->call('messages', 'PUT', [
            'groupid' => $group1,
            'source' => Message::YAHOO_APPROVED,
            'from' => 'test@test.com',
            'yahooapprovedid' => 833,
            'message' => $msg
        ]);

        # Should work
        assertEquals(0, $ret['ret']);
        assertEquals(MailRouter::APPROVED, $ret['routed']);

        error_log(__METHOD__ . " end");
    }
}

