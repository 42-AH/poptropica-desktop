<?php
declare(strict_types=1);
// Render the original game's column-ordered RGB export directly as a PNG.
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if(($_SERVER['REQUEST_METHOD']??'GET')!=='POST'){header('Allow: POST');http_response_code(405);exit;}
$width=filter_var($_POST['width']??null,FILTER_VALIDATE_INT);
$height=filter_var($_POST['height']??null,FILTER_VALIDATE_INT);
$encoded=$_POST['img']??null;
if(!$width||!$height||$width<1||$height<1||$width>2048||$height>2048||$width*$height>600000||!is_string($encoded)||strlen($encoded)>4200000){http_response_code(422);exit('Invalid picture dimensions.');}
$pixels=explode(',',$encoded);
if(count($pixels)!==$width*$height){http_response_code(422);exit('The picture is incomplete.');}
foreach($pixels as &$pixel){if(!preg_match('/^[a-fA-F0-9]{1,6}$/D',$pixel)){http_response_code(422);exit('Invalid picture color.');}$pixel=hex2bin(str_pad($pixel,6,'0',STR_PAD_LEFT));}unset($pixel);
$scanlines='';
for($row=0;$row<$height;$row++){$scanlines.="\0";for($column=0;$column<$width;$column++)$scanlines.=$pixels[$column*$height+$row];}
function png_block(string $name,string $body): string {return pack('N',strlen($body)).$name.$body.pack('N',crc32($name.$body));}
$png="\x89PNG\r\n\x1a\n".png_block('IHDR',pack('NNCCCCC',$width,$height,8,2,0,0,0)).png_block('IDAT',gzcompress($scanlines,6)).png_block('IEND','');
header('Content-Type: image/png');header('Content-Disposition: inline; filename="poptropica-picture.png"');header('Content-Length: '.strlen($png));echo $png;
