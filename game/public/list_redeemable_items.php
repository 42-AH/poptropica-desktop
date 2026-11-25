<?php
declare(strict_types=1);
require dirname(__DIR__).'/server/legacy-catalog.php';
$categories=$_POST['cats']??$_GET['cats']??'2001|2002';
if(!is_string($categories)||!preg_match('/^[0-9|]{1,64}$/D',$categories)){http_response_code(422);exit;}
$catalog=legacy_store_catalog();$result=[];
foreach(array_unique(explode('|',$categories)) as $category){if(!array_key_exists($category,$catalog)){http_response_code(422);exit;}$result[$category]=$catalog[$category];}
legacy_catalog_reply(['items_info'=>json_encode((object)$result,JSON_THROW_ON_ERROR)]);
