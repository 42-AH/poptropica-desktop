<?php
if (parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH)==='/room-test') {
    header('Content-Type: text/html');
    echo '<!doctype html><title>Room check</title><body>Arcade room check</body>';
    exit;
}
return require getenv('QA_CANDIDATE').'/router.php';
