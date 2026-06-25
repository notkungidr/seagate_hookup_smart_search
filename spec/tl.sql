/*
 Navicat Premium Data Transfer

 Source Server         : sghu-db01
 Source Server Type    : MySQL
 Source Server Version : 50022 (5.0.22-log)
 Source Host           : sghu-db01:3306
 Source Schema         : seagate

 Target Server Type    : MySQL
 Target Server Version : 50022 (5.0.22-log)
 File Encoding         : 65001

 Date: 25/05/2026 17:11:52
*/

SET NAMES utf8;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for tl
-- ----------------------------
DROP TABLE IF EXISTS `tl`;
CREATE TABLE `tl`  (
  `lot` varchar(20) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL DEFAULT '',
  `tl` varchar(25) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL DEFAULT '',
  `date` date NOT NULL DEFAULT '0000-00-00',
  `time` time NOT NULL DEFAULT '00:00:00',
  `en` varchar(5) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL DEFAULT '',
  `lot_size` int(11) NULL DEFAULT 0,
  `flex` char(1) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `pivot` char(1) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `remark` varchar(100) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `internal_remark` varchar(300) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `sbr_no` varchar(50) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `re_fg` enum('N','Y') CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT 'N',
  `rtv` enum('N','Y') CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT 'N',
  `pn_BIT` varchar(50) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `preamp_name` varchar(50) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `cus_type` varchar(10) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `product_code` varchar(2) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `digit5` varchar(2) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `prefix` varchar(2) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `pcca_part_no_rev` varchar(20) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `dp460_lot` varchar(50) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `stx_sbr` varchar(100) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `arm` varchar(50) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `eblock` varchar(50) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `coil` varchar(50) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  `pccarev` varchar(1) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT '',
  PRIMARY KEY USING BTREE (`tl`),
  INDEX `date` USING BTREE(`date`),
  INDEX `time` USING BTREE(`time`),
  INDEX `en` USING BTREE(`en`),
  INDEX `lot` USING BTREE(`lot`),
  INDEX `dp460_lot` USING BTREE(`dp460_lot`),
  INDEX `pn_BIT` USING BTREE(`pn_BIT`),
  INDEX `arm` USING BTREE(`arm`),
  INDEX `eblock` USING BTREE(`eblock`),
  INDEX `coil` USING BTREE(`coil`),
  INDEX `pccarev` USING BTREE(`pccarev`)
) ENGINE = MyISAM CHARACTER SET = latin1 COLLATE = latin1_swedish_ci COMMENT = 'This table for addition and printing traveler lot' ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
