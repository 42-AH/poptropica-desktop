<?php
declare(strict_types=1);
// Legacy game navigation enters the same bridge without loading another player.
header('Cache-Control: no-store');
header('Location: /base.php?room=GlobalAS3Embassy', true, 303);
exit;
