<?php
// The archived AMF transport uses deprecated constructs. Keep warnings out of
// its binary responses; real errors still go to the server log.
error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED);
/**
 *  This file is part of amfPHP
 *
 * LICENSE
 *
 * This source file is subject to the license that is bundled
 * with this package in the file license.txt.
 */

/**
*  includes
 * @package Amfphp
*  */
require_once dirname(__FILE__) . '/ClassLoader.php';

/* 
 * main entry point (gateway) for service calls. instanciates the gateway class and uses it to handle the call.
 * 
 * @package Amfphp
 * @author Ariel Sommeria-klein
 */
$gateway = Amfphp_Core_HttpRequestGatewayFactory::createGateway();

//use this to change the current folder to the services folder. Be careful of the case.
//This was done in 1.9 and can be used to support relative includes, and should be used when upgrading from 1.9 to 2.0 if you use relative includes
//chdir(dirname(__FILE__) . '/Services');

$gateway->service();
$gateway->output();


?>
