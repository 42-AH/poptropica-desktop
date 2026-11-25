<?php
declare(strict_types=1);
require dirname(__DIR__).'/server/legacy-catalog.php';
legacy_catalog_reply(['answer'=>'ok','json'=>json_encode(legacy_inventory_categories(),JSON_THROW_ON_ERROR)]);
