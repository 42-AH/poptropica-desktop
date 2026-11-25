<?php
declare(strict_types=1);
require dirname(__DIR__).'/server/social.php';
header('Content-Type: application/x-www-form-urlencoded; charset=utf-8');
header('Cache-Control: private, max-age=300');
echo http_build_query(social_legacy_questions(),'','&',PHP_QUERY_RFC3986);
