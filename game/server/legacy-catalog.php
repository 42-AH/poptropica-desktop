<?php
declare(strict_types=1);

function legacy_catalog_xml(string $file): ?SimpleXMLElement {
    if(!is_file($file))return null;
    $previous=libxml_use_internal_errors(true);$xml=simplexml_load_file($file,'SimpleXMLElement',LIBXML_NONET);libxml_clear_errors();libxml_use_internal_errors($previous);
    return $xml?:null;
}
function legacy_inventory_categories(): array {
    $public=dirname(__DIR__).'/public';$names=[];
    foreach(glob($public.'/game/data/scenes/*/island.xml') as $file){$xml=legacy_catalog_xml($file);if($xml&&(string)$xml->gameVersion==='AS2')$names[strtolower((string)$xml->island)]=(string)$xml->name;}
    $islands=[];
    foreach(glob($public.'/scenes/island*',GLOB_ONLYDIR) as $directory){$key=substr(basename($directory),6);$name=$names[strtolower($key)]??null;if($name)$islands[$key]=$name;}
    if(is_dir($public.'/scenes/islandHaunted'))$islands['Haunted']='Haunted House';
    if(is_dir($public.'/scenes/islandLegendarySwords'))$islands['LegendarySwords']='Legendary Swords';
    asort($islands,SORT_NATURAL|SORT_FLAG_CASE);
    return ['Store'=>'Store Items','divider'=>'—']+$islands;
}
function legacy_item_metadata(string $id): array {
    if(!preg_match('/^[0-9]{1,6}$/D',$id))throw new InvalidArgumentException('Invalid item');
    $xml=legacy_catalog_xml(dirname(__DIR__).'/public/game/data/items/store/item'.$id.'.xml');
    $name='Item '.$id;$description='';
    if($xml)foreach($xml->textfields->text as $field){$key=(string)$field['id'];if(str_starts_with($key,'title'))$name=trim(strip_tags((string)$field->value));if(str_starts_with($key,'instructions'))$description=trim(strip_tags((string)$field->value));}
    return ['item_id'=>(int)$id,'item_name'=>$name,'description'=>$description,'rental'=>false,'costume'=>$xml&&isset($xml->looks->look)];
}
function legacy_store_catalog(): array {
    $result=['2001'=>[],'2002'=>[]];
    foreach(glob(dirname(__DIR__).'/public/items/item*.swf') as $file){
        if(!preg_match('/^item([0-9]+)\.swf$/D',basename($file),$match))continue;
        $id=(int)$match[1];if($id<3000||$id>=4000)continue;$item=legacy_item_metadata((string)$id);
        // The site's restored shop offers these archived items without a purchase.
        // The catalog is descriptive; ownership still lives in the saved character.
        $result[$item['costume']?'2002':'2001'][]=['id'=>$id,'name'=>$item['item_name'],'description'=>$item['description'],'price'=>0,'pri'=>0,'pop'=>0];
    }
    return $result;
}
function legacy_catalog_reply(array $values): never {
    header('Content-Type: application/x-www-form-urlencoded; charset=utf-8');header('Cache-Control: private, no-cache');
    echo http_build_query($values,'','&',PHP_QUERY_RFC3986);exit;
}
