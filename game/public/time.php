<?php
declare(strict_types=1);
// The Flash client expects Unix seconds as an unwrapped decimal response.
header('Content-Type: text/plain; charset=us-ascii');
header('Cache-Control: no-store');
print (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('U');
