/*
 Navicat Premium Data Transfer

 Source Server         : bitintra_mse
 Source Server Type    : MySQL
 Source Server Version : 50022 (5.0.22-log)
 Source Host           : bitintra-db01.th.belton.corp:3306
 Source Schema         : BIT

 Target Server Type    : MySQL
 Target Server Version : 50022 (5.0.22-log)
 File Encoding         : 65001

 Date: 23/05/2026 18:29:27
*/

SET NAMES utf8;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for ACA_BONDING_DATA
-- ----------------------------
DROP TABLE IF EXISTS `ACA_BONDING_DATA`;
CREATE TABLE `ACA_BONDING_DATA`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pt_no` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `job_no` varchar(30) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `part_no` varchar(30) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `m_bit_model` varchar(50) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `qty` int(11) NULL DEFAULT 0,
  `reject_qty` int(11) NULL DEFAULT 0,
  `remark` varchar(100) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `customer` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `shift` varchar(10) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `oven_no` varchar(10) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `reg` timestamp NULL DEFAULT '0000-00-00 00:00:00',
  `user_reg` varchar(10) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `upd` timestamp NULL DEFAULT '0000-00-00 00:00:00',
  `user_upd` varchar(10) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `lot_coil` varchar(30) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `lot_bobbin` varchar(30) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `lot_adhesive` varchar(30) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `lot_tube` varchar(30) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `lot_pin` varchar(30) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `lot_slit` varchar(30) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `mc_no` varchar(10) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `en_operator` varchar(10) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `kamban_coil` varchar(30) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `kamban_adhesive` varchar(30) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `kamban_bobbin` varchar(30) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `rack` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `reason_code` varchar(10) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `round_coil` int(2) NULL DEFAULT NULL,
  `round_adhesive` int(2) NULL DEFAULT NULL,
  `round_bobbin` int(2) NULL DEFAULT NULL,
  PRIMARY KEY USING BTREE (`id`),
  INDEX `job_no` USING BTREE(`job_no`),
  INDEX `reg` USING BTREE(`reg`),
  INDEX `m_bit_model` USING BTREE(`m_bit_model`),
  INDEX `shift` USING BTREE(`shift`),
  INDEX `pt_no` USING BTREE(`pt_no`),
  INDEX `lot_coil` USING BTREE(`lot_coil`),
  INDEX `lot_bobbin` USING BTREE(`lot_bobbin`),
  INDEX `lot_adhesive` USING BTREE(`lot_adhesive`),
  INDEX `lot_tube` USING BTREE(`lot_tube`),
  INDEX `lot_pin` USING BTREE(`lot_pin`),
  INDEX `lot_slit` USING BTREE(`lot_slit`),
  INDEX `kamban_coil` USING BTREE(`kamban_coil`),
  INDEX `kamban_adhesive` USING BTREE(`kamban_adhesive`),
  INDEX `kamban_bobbin` USING BTREE(`kamban_bobbin`),
  INDEX `rack` USING BTREE(`rack`),
  INDEX `reason_code` USING BTREE(`reason_code`),
  INDEX `round_coil` USING BTREE(`round_coil`),
  INDEX `round_adhesive` USING BTREE(`round_adhesive`),
  INDEX `round_bobbin` USING BTREE(`round_bobbin`)
) ENGINE = MyISAM AUTO_INCREMENT = 1825505 AVG_ROW_LENGTH = 15000 CHARACTER SET = utf8 COLLATE = utf8_general_ci COMMENT = 'ACA_BONDING_DATA after production EBLOCK_CLEAN_DATA' MAX_ROWS = 1000000000 ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
