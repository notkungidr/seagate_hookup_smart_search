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

 Date: 23/05/2026 18:52:22
*/

SET NAMES utf8;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for ACA_BONDING_DATA_2
-- ----------------------------
DROP TABLE IF EXISTS `ACA_BONDING_DATA_2`;
CREATE TABLE `ACA_BONDING_DATA_2`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pt_no` varchar(20) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `type_in` varchar(10) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `job_no` varchar(30) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `part_no` varchar(30) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `m_bit_model` varchar(50) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `qty` int(11) NULL DEFAULT NULL,
  `reject_qty` int(11) NULL DEFAULT 0,
  `customer` varchar(20) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `shift` varchar(10) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `oven_no` varchar(10) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `reg` timestamp NULL DEFAULT NULL,
  `user_reg` varchar(10) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `upd` timestamp NULL DEFAULT NULL,
  `user_upd` varchar(10) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `en_operator` varchar(10) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `remark` varchar(100) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `type_out` varchar(10) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `qty_out` int(11) NULL DEFAULT NULL,
  `reject_qty_out` int(11) NULL DEFAULT NULL,
  `reg_out` timestamp NULL DEFAULT NULL,
  `user_reg_out` varchar(10) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `en_operator_out` varchar(10) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `remark_out` varchar(100) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `shift_out` varchar(10) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  `reason_code` varchar(10) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL DEFAULT NULL,
  PRIMARY KEY USING BTREE (`id`),
  INDEX `pt_no` USING BTREE(`pt_no`),
  INDEX `job_no` USING BTREE(`job_no`),
  INDEX `part_no` USING BTREE(`part_no`),
  INDEX `m_bit_model` USING BTREE(`m_bit_model`),
  INDEX `customer` USING BTREE(`customer`),
  INDEX `reg` USING BTREE(`reg`),
  INDEX `type_in` USING BTREE(`type_in`),
  INDEX `type_out` USING BTREE(`type_out`),
  INDEX `shift` USING BTREE(`shift`),
  INDEX `oven_no` USING BTREE(`oven_no`),
  INDEX `en_operator` USING BTREE(`en_operator`),
  INDEX `en_operator_out` USING BTREE(`en_operator`),
  INDEX `reg_out` USING BTREE(`reg_out`),
  INDEX `shift_out` USING BTREE(`shift_out`),
  INDEX `reason_code` USING BTREE(`reason_code`)
) ENGINE = MyISAM AUTO_INCREMENT = 15179 CHARACTER SET = latin1 COLLATE = latin1_swedish_ci ROW_FORMAT = DYNAMIC;

SET FOREIGN_KEY_CHECKS = 1;
