/*
 Navicat Premium Data Transfer

 Source Server         : sghu-db01
 Source Server Type    : MySQL
 Source Server Version : 50022 (5.0.22-log)
 Source Host           : sghu-db01:3306
 Source Schema         : ACA

 Target Server Type    : MySQL
 Target Server Version : 50022 (5.0.22-log)
 File Encoding         : 65001

 Date: 23/05/2026 09:46:39
*/

SET NAMES utf8;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for ACA_SCAN1
-- ----------------------------
DROP TABLE IF EXISTS `ACA_SCAN1`;
CREATE TABLE `ACA_SCAN1`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pt_no` varchar(50) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL DEFAULT '',
  `serial_no` varchar(50) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL DEFAULT '',
  `part_number_aca` varchar(50) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `part_number_eblock` varchar(50) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `remark` text CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL,
  `store_lot` varchar(100) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `do_no` varchar(50) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `prod_lot` varchar(100) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `product_name` varchar(255) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `machine` varchar(100) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT 'MANUAL',
  `created_by` varchar(50) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `created_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `pt_ref` varchar(255) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  PRIMARY KEY USING BTREE (`id`, `serial_no`, `created_date`, `pt_no`),
  INDEX `sn` USING BTREE(`serial_no`),
  INDEX `created_date` USING BTREE(`created_date`),
  INDEX `pt_no` USING BTREE(`pt_no`),
  INDEX `store_lot` USING BTREE(`store_lot`),
  INDEX `do_no` USING BTREE(`do_no`),
  INDEX `prod_lot` USING BTREE(`prod_lot`),
  INDEX `created_by` USING BTREE(`created_by`),
  INDEX `product_name` USING BTREE(`product_name`),
  INDEX `part_number_aca` USING BTREE(`part_number_aca`)
) ENGINE = MyISAM AUTO_INCREMENT = 29205045 CHARACTER SET = latin1 COLLATE = latin1_swedish_ci ROW_FORMAT = DYNAMIC;

SET FOREIGN_KEY_CHECKS = 1;
