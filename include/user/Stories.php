<?php

require_once(IZNIK_BASE . '/include/utils.php');
require_once(IZNIK_BASE . '/include/misc/Entity.php');

class Story extends Entity
{
    /** @var  $dbhm LoggedPDO */
    var $publicatts = array('id', 'userid', 'date', 'public', 'headline', 'story');
    var $settableatts = array('public', 'headline', 'story');

    function __construct(LoggedPDO $dbhr, LoggedPDO $dbhm, $id = NULL)
    {
        $this->fetch($dbhr, $dbhm, $id, 'users_stories', 'story', $this->publicatts);
    }

    public function create($userid, $public, $headline, $story) {
        $id = NULL;

        $rc = $this->dbhm->preExec("INSERT INTO users_stories (public, userid, headline, story) VALUES (?,?,?,?);", [
            $public,
            $userid,
            $headline,
            $story
        ]);

        if ($rc) {
            $id = $this->dbhm->lastInsertId();

            if ($id) {
                $this->fetch($this->dbhr, $this->dbhm, $id, 'users_stories', 'story', $this->publicatts);
            }
        }

        return($id);
    }

    public function delete() {
        $rc = $this->dbhm->preExec("DELETE FROM users_stories WHERE id = ?;", [ $this->id ]);
        return($rc);
    }
}