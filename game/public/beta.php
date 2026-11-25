<?php
// Old private-beta links now open the public game.
header('Cache-Control: no-store');
header('Location: /play/', true, 303);
exit;