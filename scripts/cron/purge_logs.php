<?php
#
# Purge logs. We do this in a script rather than an event because we want to chunk it, otherwise we can hang the
# cluster with an op that's too big.
#
require_once dirname(__FILE__) . '/../../include/config.php';
require_once(IZNIK_BASE . '/include/utils.php');
require_once(IZNIK_BASE . '/include/db.php');

# Bypass our usual DB class as we don't want the overhead nor to log.
$dsn = "mysql:host={$dbconfig['host']};dbname=iznik;charset=utf8";
$dbhm = new PDO($dsn, $dbconfig['user'], $dbconfig['pass'], array(
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_EMULATE_PREPARES => FALSE
));

error_log("Purge main logs");

try {
# Non-Freegle groups only keep data for 31 days.
    $start = date('Y-m-d', strtotime("midnight 31 days ago"));
    error_log("Non-Freegle logs");
    $groups = $dbhr->preQuery("SELECT id FROM groups WHERE type != 'Freegle';");
    foreach ($groups as $group) {
        $total = 0;
        do {
            $count = $dbhm->exec("DELETE FROM logs WHERE `timestamp` < '$start' AND groupid IS NOT NULL AND groupid = ? LIMIT 1000;", $group['id']);
            $total += $count;
            error_log("...$total");
        } while ($count > 0);
    }
} catch (Exception $e) {
    error_log("Failed to delete non-Freegle logs " . $e->getMessage());
}

# In the main logs table we might have logs that can be removed once enough time has elapsed for us using them for PD.
$start = date('Y-m-d', strtotime("midnight 7 days ago"));
$keys = [
    'user' => 'users',
    'byuser' => 'users',
    'msgid' => 'messages',
    'groupid' => 'groups',
    'configid' => 'mod_configs',
    'stdmsgid' => 'mod_stdmsgs',
    'bulkopid' => 'mod_bulkops'
];

//foreach ($keys as $att => $table) {
//    error_log("Logs for $att not in $table");
//    $total = 0;
//    do {
//        $count = $dbhm->exec("DELETE FROM logs WHERE timestamp < '$start' AND $att IS NOT NULL AND $att <> 0 AND $att NOT IN (SELECT id FROM $table) LIMIT 1000;");
//        $total += $count;
//        error_log("...$total");
//    } while ($count > 0);
//}

# Src logs.
$start = date('Y-m-d', strtotime("midnight 30 days ago"));
error_log("Purge src logs before $start");

try {
    error_log("Src logs:");
    $total = 0;
    do {
        $count = $dbhm->exec("DELETE FROM logs_src WHERE `date` < '$start' LIMIT 1000;");
        $total += $count;
        error_log("...$total");
    } while ($count > 0);
} catch (Exception $e) {
    error_log("Failed to delete src logs " . $e->getMessage());
}

$start = date('Y-m-d', strtotime("midnight 1 day ago"));
error_log("Purge detailed logs before $start");

try {
    error_log("Plugin logs:");
    $total = 0;
    do {
        $count = $dbhm->exec("DELETE FROM logs WHERE `timestamp` < '$start' AND TYPE = 'Plugin' LIMIT 1000;");
        $total += $count;
        error_log("...$total");
    } while ($count > 0);
} catch (Exception $e) {
    error_log("Failed to delete Plugin logs " . $e->getMessage());
}

try {
    error_log("API logs:");
    $total = 0;
    do {
        $count = $dbhm->exec("DELETE FROM logs_api WHERE `date` < '$start' LIMIT 1000;");
        $total += $count;
        error_log("...$total");
    } while ($count > 0);
} catch (Exception $e) {
    error_log("Failed to delete API logs " . $e->getMessage());
}

try {
    error_log("SQL logs:");
    $total = 0;
    do {
        $count = $dbhm->exec("DELETE FROM logs_sql WHERE `date` < '$start' LIMIT 1000;");
        $total += $count;
        error_log("...$total");
    } while ($count > 0);
} catch (Exception $e) {
    error_log("Failed to delete SQL logs " . $e->getMessage());
}