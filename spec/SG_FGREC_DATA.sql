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

 Date: 21/05/2026 14:35:49
*/

SET NAMES utf8;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for SG_FGREC_DATA
-- ----------------------------
DROP TABLE IF EXISTS `SG_FGREC_DATA`;
CREATE TABLE `SG_FGREC_DATA`  (
  `store_lot` varchar(20) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL DEFAULT '',
  `prod_lot` varchar(50) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL DEFAULT '',
  `lot_size` double(11, 2) NOT NULL DEFAULT 0.00,
  `mt_no` varchar(15) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL DEFAULT '',
  `product_name` varchar(255) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL DEFAULT '',
  `item_no` varchar(15) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL DEFAULT '',
  `cust_pn` varchar(50) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL DEFAULT '',
  `customer` varchar(20) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL DEFAULT '',
  `remark` varchar(100) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL DEFAULT '',
  `sbr_no` varchar(10) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `receive_date` timestamp NOT NULL DEFAULT '0000-00-00 00:00:00',
  `lot_status` enum('Inactive','Active','Cancel') CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL DEFAULT 'Inactive',
  `internal_remark` varchar(300) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `flax` char(1) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `pivot` char(1) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `preamp_name` varchar(50) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `re_fg` varchar(1) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `rtv` varchar(1) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  PRIMARY KEY USING BTREE (`store_lot`, `prod_lot`, `receive_date`, `lot_status`),
  INDEX `item_no` USING BTREE(`item_no`),
  INDEX `customer` USING BTREE(`customer`),
  INDEX `store_lot` USING BTREE(`store_lot`),
  INDEX `prod_lot` USING BTREE(`prod_lot`),
  INDEX `mt_no` USING BTREE(`mt_no`),
  INDEX `receive_date` USING BTREE(`receive_date`),
  INDEX `lot_status` USING BTREE(`lot_status`),
  INDEX `flax` USING BTREE(`flax`),
  INDEX `pivot` USING BTREE(`pivot`),
  INDEX `re_fg` USING BTREE(`re_fg`),
  INDEX `rtv` USING BTREE(`rtv`)
) ENGINE = MyISAM CHARACTER SET = latin1 COLLATE = latin1_swedish_ci COMMENT = 'keep data lot seagate' ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
