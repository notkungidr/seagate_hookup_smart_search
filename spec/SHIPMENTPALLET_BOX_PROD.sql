/*
 Navicat Premium Data Transfer

 Source Server         : bitintra_mse
 Source Server Type    : MySQL
 Source Server Version : 50022 (5.0.22-log)
 Source Host           : bitintra-db01.th.belton.corp:3306
 Source Schema         : WMS

 Target Server Type    : MySQL
 Target Server Version : 50022 (5.0.22-log)
 File Encoding         : 65001

 Date: 21/05/2026 14:32:52
*/

SET NAMES utf8;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for SHIPMENTPALLET_BOX_PROD
-- ----------------------------
DROP TABLE IF EXISTS `SHIPMENTPALLET_BOX_PROD`;
CREATE TABLE `SHIPMENTPALLET_BOX_PROD`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `plan_id` int(11) NULL DEFAULT NULL,
  `qty` double(11, 2) NULL DEFAULT NULL,
  `prod_lot` varchar(50) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `store_lot` varchar(40) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `do_no` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL DEFAULT '' COMMENT 'DO NO. Link plan_id',
  PRIMARY KEY USING BTREE (`id`),
  INDEX `do_no` USING BTREE(`do_no`),
  INDEX `store_lot` USING BTREE(`store_lot`),
  INDEX `prod_lot` USING BTREE(`prod_lot`)
) ENGINE = MyISAM AUTO_INCREMENT = 687941 CHARACTER SET = latin1 COLLATE = latin1_swedish_ci ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
