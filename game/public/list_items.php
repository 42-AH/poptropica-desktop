<?php
declare(strict_types=1);
require dirname(__DIR__).'/server/legacy-catalog.php';
$ids=$_POST['items']??$_GET['items']??null;
if(!is_string($ids)||strlen($ids)>4096||!preg_match('/^[0-9|]+$/D',$ids)){http_response_code(422);exit;}
$result=[];
foreach(array_unique(explode('|',$ids)) as $id){if(!preg_match('/^[0-9]{1,6}$/D',$id)){http_response_code(422);exit;}$item=legacy_item_metadata($id);unset($item['costume']);$result[]=$item;}
legacy_catalog_reply(['items_info'=>json_encode($result,JSON_THROW_ON_ERROR)]);
