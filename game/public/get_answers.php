<?php
declare(strict_types=1);
require dirname(__DIR__).'/server/social.php';
header('Content-Type: application/x-www-form-urlencoded; charset=utf-8');
header('Cache-Control: no-store');
$id=filter_var($_POST['quest_id']??$_GET['quest_id']??null,FILTER_VALIDATE_INT);
if(!$id||!isset(social_chat_catalog()['messages'][$id])){http_response_code(422);exit;}
echo http_build_query(social_legacy_questions($id),'','&',PHP_QUERY_RFC3986);
