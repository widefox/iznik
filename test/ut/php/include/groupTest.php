<?php

if (!defined('UT_DIR')) {
    define('UT_DIR', dirname(__FILE__) . '/../..');
}
require_once UT_DIR . '/IznikTest.php';
require_once IZNIK_BASE . '/include/group/Group.php';

/**
 * @backupGlobals disabled
 * @backupStaticAttributes disabled
 */
class groupTest extends IznikTest {
    private $dbhr, $dbhm;

    protected function setUp() {
        parent::setUp ();

        global $dbhr, $dbhm;
        $this->dbhr = $dbhr;
        $this->dbhm = $dbhm;

        $this->dbhm->exec("DELETE FROM groups WHERE nameshort = 'testgroup';");
    }

    protected function tearDown() {
        parent::tearDown ();
    }

    public function __construct() {
    }

    public function testBasic() {
        error_log(__METHOD__);

        $g = new Group($this->dbhr, $this->dbhm);
        $g->create('testgroup', Group::GROUP_REUSE);
        $atts = $g->getPublic();
        assertEquals('testgroup', $atts['nameshort']);
        assertEquals($atts['id'], $g->getPrivate('id'));
        assertNull($g->getPrivate('invalidid'));
        assertGreaterThan(0 ,$g->delete());

        error_log(__METHOD__ . " end");
    }

    public function testErrors() {
        error_log(__METHOD__);

        # Create duplicate group
        $g = new Group($this->dbhr, $this->dbhm);
        $id = $g->create('testgroup', Group::GROUP_REUSE);
        assertNotNull($id);
        $id = $g->create('testgroup', Group::GROUP_REUSE);
        assertNull($id);

        $id = $g->findByShortName('zzzz');
        assertNull($id);

        error_log(__METHOD__ . " end");
    }
}

