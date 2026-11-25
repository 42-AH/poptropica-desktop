<?php
declare(strict_types=1);
require dirname(__DIR__).'/server/legacy-catalog.php';
$id=$_POST['item_id']??$_GET['item_id']??null;
if(!is_string($id)||!preg_match('/^[0-9]{1,6}$/D',$id)){http_response_code(422);exit;}
$item=legacy_item_metadata($id);
legacy_catalog_reply(['answer'=>'ok','desc'=>$item['item_name']]);
