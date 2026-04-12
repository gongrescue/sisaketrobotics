require('dotenv').config();
const mongoose = require('mongoose');
const Competition = require('./models/Competition');
const User = require('./models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sisaket_robotics';

const competitions = [
  // ═══════════════════════════════════════════════════════════════
  // 1. หุ่นยนต์ปลูกหอมกระเทียม (บังคับมือ) ≤18ปี
  // ═══════════════════════════════════════════════════════════════
  {
    code: 'GARLIC_M18',
    name: 'หุ่นยนต์ปลูกหอมกระเทียม (บังคับมือ) รุ่นอายุไม่เกิน 18 ปี',
    nameEn: 'Garlic & Onion Planting Robot (Manual) U18',
    description: 'หุ่นยนต์บังคับมือ เคลื่อนย้ายต้นหอมแดงและกระเทียมไปปลูกในพื้นที่ที่กำหนด ผู้แข่ง 2 คน ควบทีม 2 คน',
    category: 'manual',
    ageGroup: '≤18',
    scoringType: 'POINT',
    rankingMethod: 'SUM',
    totalRounds: 3,
    timePerRoundSeconds: 180,
    setupTimeSeconds: 30,
    scoringCriteria: [
      { key: 'items_flat',  label: 'วางบนพื้นราบ (กล่อง)', labelEn: 'Flat surface', type: 'number', pointsPerUnit: 1 },
      { key: 'items_5cm',   label: 'วางพื้นสูง 5 ซม. (กล่อง)', type: 'number', pointsPerUnit: 2 },
      { key: 'items_8cm',   label: 'วางพื้นสูง 8 ซม. (กล่อง)', type: 'number', pointsPerUnit: 3 },
      { key: 'items_10cm',  label: 'วางพื้นสูง 10 ซม. (กล่อง)', type: 'number', pointsPerUnit: 4 },
      { key: 'items_15cm',  label: 'วางพื้นสูง 15 ซม. (กล่อง)', type: 'number', pointsPerUnit: 5 },
      { key: 'items_pillar',label: 'วางบนอุปสรรคสิ่งกีดขวาง (กล่อง)', type: 'number', pointsPerUnit: 8 },
      { key: 'return_stop', label: 'กลับจุด STOP สำเร็จ', type: 'boolean', points: 10 }
    ],
    maxTeams: 40, status: 'registration', sortOrder: 1
  },

  // ═══════════════════════════════════════════════════════════════
  // 2. หุ่นยนต์เลี้ยงวัว Battle ≤12ปี (BATTLE format)
  // ═══════════════════════════════════════════════════════════════
  {
    code: 'COW_BATTLE_12',
    name: 'หุ่นยนต์เลี้ยงวัว Battle รุ่นอายุไม่เกิน 12 ปี',
    nameEn: 'Cow Herding Battle Robot U12',
    description: 'แข่งแบบ Battle คู่ต่อคู่ หุ่นยนต์นำลูกปิงปองขาว(วัว)เข้าคอก และป้องกันลูกปิงปองส้ม(เสือ) ผู้แข่ง 2 คน',
    category: 'manual',
    ageGroup: '≤12',
    scoringType: 'BATTLE',
    rankingMethod: 'SUM',
    totalRounds: 1,
    timePerRoundSeconds: 120,
    setupTimeSeconds: 30,
    scoringCriteria: [
      { key: 'white_balls', label: 'ลูกปิงปองขาว (วัว) ในคอก', type: 'number', pointsPerUnit: 5, description: '+5 คะแนน/ลูก' },
      { key: 'orange_balls', label: 'ลูกปิงปองส้ม (เสือ) ในคอก', type: 'number', pointsPerUnit: 5, isPenalty: true, description: '-5 คะแนน/ลูก' }
    ],
    maxTeams: 32, status: 'registration', sortOrder: 2
  },

  // ═══════════════════════════════════════════════════════════════
  // 3. หุ่นยนต์ปลูกทุเรียนภูเขาไฟ (อัตโนมัติ) ≤18ปี
  // ═══════════════════════════════════════════════════════════════
  {
    code: 'DURIAN_A18',
    name: 'หุ่นยนต์ปลูกทุเรียนภูเขาไฟ (อัตโนมัติ) รุ่นอายุไม่เกิน 18 ปี',
    nameEn: 'Durian Planting Robot (Autonomous) U18',
    description: 'หุ่นยนต์อัตโนมัติ เคลื่อนย้ายกระป๋องแทนพันธุ์ทุเรียนไปยังพื้นที่ปลูกตามสี ผู้แข่ง 2 คน',
    category: 'autonomous',
    ageGroup: '≤18',
    scoringType: 'POINT',
    rankingMethod: 'SUM',
    totalRounds: 3,
    timePerRoundSeconds: 180,
    setupTimeSeconds: 30,
    scoringCriteria: [
      { key: 'yellow_correct', label: 'กระป๋องสีเหลือง (หมากอง) วางถูกที่', type: 'number', pointsPerUnit: 10 },
      { key: 'red_correct',    label: 'กระป๋องสีแดง (ชะนี) วางถูกที่', type: 'number', pointsPerUnit: 10 },
      { key: 'blue_correct',   label: 'กระป๋องสีน้ำเงิน (ก้านยาว) วางถูกที่', type: 'number', pointsPerUnit: 10 },
      { key: 'green_correct',  label: 'กระป๋องสีเขียว (ส่งขาย) วางถูกที่', type: 'number', pointsPerUnit: 10 },
      { key: 'checkpoint_penalty', label: 'ผ่านจุดห้าม (ปรับ)', type: 'number', pointsPerUnit: 10, isPenalty: true },
      { key: 'return_finish',  label: 'กลับจุด Finish สำเร็จ', type: 'boolean', points: 20 }
    ],
    maxTeams: 40, status: 'registration', sortOrder: 3
  },

  // ═══════════════════════════════════════════════════════════════
  // 4-6. หุ่นยนต์กู้ภัย (ไม่จำกัดบอร์ด) 3 รุ่นอายุ
  // ═══════════════════════════════════════════════════════════════
  {
    code: 'RESCUE_NB12',
    name: 'หุ่นยนต์กู้ภัย (ไม่จำกัดบอร์ด) รุ่นอายุไม่เกิน 12 ปี',
    nameEn: 'Rescue Robot (No-Board Limit) U12',
    description: 'หุ่นยนต์อัตโนมัติ นำถุงยังชีพไปวางจุดที่กำหนดตามสี เคลื่อนในพื้นที่สีขาว',
    category: 'autonomous',
    ageGroup: '≤12',
    scoringType: 'POINT',
    rankingMethod: 'SUM',
    totalRounds: 3,
    timePerRoundSeconds: 180,
    setupTimeSeconds: 30,
    scoringCriteria: [
      { key: 'checkpoint_passed', label: 'จุด Checkpoint ที่ผ่านได้', type: 'number', pointsPerUnit: 5 },
      { key: 'bag_red',    label: 'ถุงยังชีพสีแดงวางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'bag_yellow', label: 'ถุงยังชีพสีเหลืองวางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'bag_blue',   label: 'ถุงยังชีพสีน้ำเงินวางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'bag_green',  label: 'ถุงยังชีพสีเขียววางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'return_start', label: 'กลับจุด START สำเร็จ', type: 'boolean', points: 20 }
    ],
    maxTeams: 40, status: 'registration', sortOrder: 4
  },
  {
    code: 'RESCUE_NB15',
    name: 'หุ่นยนต์กู้ภัย (ไม่จำกัดบอร์ด) รุ่นอายุไม่เกิน 15 ปี',
    nameEn: 'Rescue Robot (No-Board Limit) U15',
    description: 'หุ่นยนต์อัตโนมัติ นำถุงยังชีพไปวางจุดที่กำหนดตามสี เคลื่อนในพื้นที่สีขาว',
    category: 'autonomous', ageGroup: '≤15', scoringType: 'POINT', rankingMethod: 'SUM',
    totalRounds: 3, timePerRoundSeconds: 180, setupTimeSeconds: 30,
    scoringCriteria: [
      { key: 'checkpoint_passed', label: 'จุด Checkpoint ที่ผ่านได้', type: 'number', pointsPerUnit: 5 },
      { key: 'bag_red',    label: 'ถุงยังชีพสีแดงวางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'bag_yellow', label: 'ถุงยังชีพสีเหลืองวางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'bag_blue',   label: 'ถุงยังชีพสีน้ำเงินวางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'bag_green',  label: 'ถุงยังชีพสีเขียววางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'return_start', label: 'กลับจุด START สำเร็จ', type: 'boolean', points: 20 }
    ],
    maxTeams: 40, status: 'registration', sortOrder: 5
  },
  {
    code: 'RESCUE_NB18',
    name: 'หุ่นยนต์กู้ภัย (ไม่จำกัดบอร์ด) รุ่นอายุไม่เกิน 18 ปี',
    nameEn: 'Rescue Robot (No-Board Limit) U18',
    description: 'หุ่นยนต์อัตโนมัติ นำถุงยังชีพไปวางจุดที่กำหนดตามสี เคลื่อนในพื้นที่สีขาว',
    category: 'autonomous', ageGroup: '≤18', scoringType: 'POINT', rankingMethod: 'SUM',
    totalRounds: 3, timePerRoundSeconds: 180, setupTimeSeconds: 30,
    scoringCriteria: [
      { key: 'checkpoint_passed', label: 'จุด Checkpoint ที่ผ่านได้', type: 'number', pointsPerUnit: 5 },
      { key: 'bag_red',    label: 'ถุงยังชีพสีแดงวางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'bag_yellow', label: 'ถุงยังชีพสีเหลืองวางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'bag_blue',   label: 'ถุงยังชีพสีน้ำเงินวางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'bag_green',  label: 'ถุงยังชีพสีเขียววางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'return_start', label: 'กลับจุด START สำเร็จ', type: 'boolean', points: 20 }
    ],
    maxTeams: 40, status: 'registration', sortOrder: 6
  },

  // ═══════════════════════════════════════════════════════════════
  // 7-9. หุ่นยนต์กู้ภัย Lego Edition 3 รุ่นอายุ
  // ═══════════════════════════════════════════════════════════════
  {
    code: 'RESCUE_LEGO12',
    name: 'หุ่นยนต์กู้ภัย Lego Edition รุ่นอายุไม่เกิน 12 ปี',
    nameEn: 'Rescue Robot (Lego Edition) U12',
    description: 'หุ่นยนต์ Lego อัตโนมัติ นำถุงยังชีพไปวางจุดที่กำหนดตามสี',
    category: 'autonomous', ageGroup: '≤12', scoringType: 'POINT', rankingMethod: 'SUM',
    totalRounds: 3, timePerRoundSeconds: 180, setupTimeSeconds: 30,
    scoringCriteria: [
      { key: 'checkpoint_passed', label: 'จุด Checkpoint ที่ผ่านได้', type: 'number', pointsPerUnit: 5 },
      { key: 'bag_red',    label: 'ถุงยังชีพสีแดงวางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'bag_yellow', label: 'ถุงยังชีพสีเหลืองวางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'bag_blue',   label: 'ถุงยังชีพสีน้ำเงินวางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'bag_green',  label: 'ถุงยังชีพสีเขียววางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'return_start', label: 'กลับจุด START สำเร็จ', type: 'boolean', points: 20 }
    ],
    maxTeams: 40, status: 'registration', sortOrder: 7
  },
  {
    code: 'RESCUE_LEGO15',
    name: 'หุ่นยนต์กู้ภัย Lego Edition รุ่นอายุไม่เกิน 15 ปี',
    nameEn: 'Rescue Robot (Lego Edition) U15',
    description: 'หุ่นยนต์ Lego อัตโนมัติ นำถุงยังชีพไปวางจุดที่กำหนดตามสี',
    category: 'autonomous', ageGroup: '≤15', scoringType: 'POINT', rankingMethod: 'SUM',
    totalRounds: 3, timePerRoundSeconds: 180, setupTimeSeconds: 30,
    scoringCriteria: [
      { key: 'checkpoint_passed', label: 'จุด Checkpoint ที่ผ่านได้', type: 'number', pointsPerUnit: 5 },
      { key: 'bag_red',    label: 'ถุงยังชีพสีแดงวางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'bag_yellow', label: 'ถุงยังชีพสีเหลืองวางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'bag_blue',   label: 'ถุงยังชีพสีน้ำเงินวางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'bag_green',  label: 'ถุงยังชีพสีเขียววางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'return_start', label: 'กลับจุด START สำเร็จ', type: 'boolean', points: 20 }
    ],
    maxTeams: 40, status: 'registration', sortOrder: 8
  },
  {
    code: 'RESCUE_LEGO18',
    name: 'หุ่นยนต์กู้ภัย Lego Edition รุ่นอายุไม่เกิน 18 ปี',
    nameEn: 'Rescue Robot (Lego Edition) U18',
    description: 'หุ่นยนต์ Lego อัตโนมัติ นำถุงยังชีพไปวางจุดที่กำหนดตามสี',
    category: 'autonomous', ageGroup: '≤18', scoringType: 'POINT', rankingMethod: 'SUM',
    totalRounds: 3, timePerRoundSeconds: 180, setupTimeSeconds: 30,
    scoringCriteria: [
      { key: 'checkpoint_passed', label: 'จุด Checkpoint ที่ผ่านได้', type: 'number', pointsPerUnit: 5 },
      { key: 'bag_red',    label: 'ถุงยังชีพสีแดงวางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'bag_yellow', label: 'ถุงยังชีพสีเหลืองวางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'bag_blue',   label: 'ถุงยังชีพสีน้ำเงินวางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'bag_green',  label: 'ถุงยังชีพสีเขียววางถูก', type: 'number', pointsPerUnit: 15 },
      { key: 'return_start', label: 'กลับจุด START สำเร็จ', type: 'boolean', points: 20 }
    ],
    maxTeams: 40, status: 'registration', sortOrder: 9
  },

  // ═══════════════════════════════════════════════════════════════
  // 10-12. หุ่นยนต์แยกขยะ (อัตโนมัติ) 3 รุ่นอายุ
  // ═══════════════════════════════════════════════════════════════
  {
    code: 'SORT_12',
    name: 'หุ่นยนต์แยกขยะ (อัตโนมัติ) รุ่นอายุไม่เกิน 12 ปี',
    nameEn: 'Waste Sorting Robot (Autonomous) U12',
    description: 'หุ่นยนต์อัตโนมัติ แยกกระป๋องสีดำ(ขยะ)และสีขาว(รีไซเคิล) ไปยังพื้นที่ถูกต้อง',
    category: 'autonomous', ageGroup: '≤12', scoringType: 'POINT', rankingMethod: 'SUM',
    totalRounds: 3, timePerRoundSeconds: 180, setupTimeSeconds: 30,
    scoringCriteria: [
      { key: 'black_sorted', label: 'กระป๋องสีดำ (ขยะ) แยกถูก', type: 'number', pointsPerUnit: 10 },
      { key: 'white_sorted', label: 'กระป๋องสีขาว (รีไซเคิล) แยกถูก', type: 'number', pointsPerUnit: 10 },
      { key: 'wrong_sort',   label: 'กระป๋องแยกผิดที่ (ปรับ)', type: 'number', pointsPerUnit: 5, isPenalty: true },
      { key: 'return_start', label: 'กลับจุดเริ่มต้น', type: 'boolean', points: 10 }
    ],
    maxTeams: 40, status: 'registration', sortOrder: 10
  },
  {
    code: 'SORT_15',
    name: 'หุ่นยนต์แยกขยะ (อัตโนมัติ) รุ่นอายุไม่เกิน 15 ปี',
    nameEn: 'Waste Sorting Robot (Autonomous) U15',
    description: 'หุ่นยนต์อัตโนมัติ แยกกระป๋องสีดำ(ขยะ)และสีขาว(รีไซเคิล)',
    category: 'autonomous', ageGroup: '≤15', scoringType: 'POINT', rankingMethod: 'SUM',
    totalRounds: 3, timePerRoundSeconds: 180, setupTimeSeconds: 30,
    scoringCriteria: [
      { key: 'black_sorted', label: 'กระป๋องสีดำ (ขยะ) แยกถูก', type: 'number', pointsPerUnit: 10 },
      { key: 'white_sorted', label: 'กระป๋องสีขาว (รีไซเคิล) แยกถูก', type: 'number', pointsPerUnit: 10 },
      { key: 'wrong_sort',   label: 'กระป๋องแยกผิดที่ (ปรับ)', type: 'number', pointsPerUnit: 5, isPenalty: true },
      { key: 'return_start', label: 'กลับจุดเริ่มต้น', type: 'boolean', points: 10 }
    ],
    maxTeams: 40, status: 'registration', sortOrder: 11
  },
  {
    code: 'SORT_18',
    name: 'หุ่นยนต์แยกขยะ (อัตโนมัติ) รุ่นอายุไม่เกิน 18 ปี',
    nameEn: 'Waste Sorting Robot (Autonomous) U18',
    description: 'หุ่นยนต์อัตโนมัติ แยกกระป๋องสีดำ(ขยะ)และสีขาว(รีไซเคิล)',
    category: 'autonomous', ageGroup: '≤18', scoringType: 'POINT', rankingMethod: 'SUM',
    totalRounds: 3, timePerRoundSeconds: 180, setupTimeSeconds: 30,
    scoringCriteria: [
      { key: 'black_sorted', label: 'กระป๋องสีดำ (ขยะ) แยกถูก', type: 'number', pointsPerUnit: 10 },
      { key: 'white_sorted', label: 'กระป๋องสีขาว (รีไซเคิล) แยกถูก', type: 'number', pointsPerUnit: 10 },
      { key: 'wrong_sort',   label: 'กระป๋องแยกผิดที่ (ปรับ)', type: 'number', pointsPerUnit: 5, isPenalty: true },
      { key: 'return_start', label: 'กลับจุดเริ่มต้น', type: 'boolean', points: 10 }
    ],
    maxTeams: 40, status: 'registration', sortOrder: 12
  },

  // ═══════════════════════════════════════════════════════════════
  // 13-14. หุ่นยนต์อัตโนมัติ เที่ยวเมืองศรีสะเกษ 2 รุ่น
  // ═══════════════════════════════════════════════════════════════
  {
    code: 'TOUR_15',
    name: 'หุ่นยนต์อัตโนมัติ "เที่ยวเมืองศรีสะเกษ" รุ่นอายุไม่เกิน 15 ปี',
    nameEn: 'Sisaket City Tour Robot (Autonomous) U15',
    description: 'หุ่นยนต์อัตโนมัติวิ่งตามเส้นทาง หยิบและวางกล่องตามแหล่งท่องเที่ยวศรีสะเกษ',
    category: 'autonomous', ageGroup: '≤15', scoringType: 'POINT', rankingMethod: 'BEST',
    totalRounds: 3, timePerRoundSeconds: 300, setupTimeSeconds: 30,
    scoringCriteria: [
      { key: 'started',         label: 'ออกจากจุดเริ่มต้นได้', type: 'boolean', points: 10 },
      { key: 'box_picked',      label: 'หยิบกล่องได้ (กล่อง)', type: 'number', pointsPerUnit: 10 },
      { key: 'box_correct',     label: 'วางกล่องถูกที่ (กล่อง)', type: 'number', pointsPerUnit: 20 },
      { key: 'pingpong_scored', label: 'ยิงลูกปิงปองสำเร็จ', type: 'number', pointsPerUnit: 10 },
      { key: 'landmark_done',   label: 'ภารกิจสัญลักษณ์เมือง (logo)', type: 'boolean', points: 50 },
      { key: 'all_10_boxes',    label: 'เก็บกล่องครบ 10 ใบ', type: 'boolean', points: 0, isBonus: true }
    ],
    maxTeams: 40, status: 'registration', sortOrder: 13
  },
  {
    code: 'TOUR_OPEN',
    name: 'หุ่นยนต์อัตโนมัติ "เที่ยวเมืองศรีสะเกษ" รุ่นทั่วไป (ไม่จำกัดอายุ)',
    nameEn: 'Sisaket City Tour Robot (Autonomous) Open',
    description: 'หุ่นยนต์อัตโนมัติ รุ่นทั่วไป มีอุปสรรคสะพานเพิ่มเติม',
    category: 'autonomous', ageGroup: 'open', scoringType: 'POINT', rankingMethod: 'BEST',
    totalRounds: 3, timePerRoundSeconds: 300, setupTimeSeconds: 30,
    scoringCriteria: [
      { key: 'started',         label: 'ออกจากจุดเริ่มต้นได้', type: 'boolean', points: 10 },
      { key: 'box_picked',      label: 'หยิบกล่องได้ (กล่อง)', type: 'number', pointsPerUnit: 10 },
      { key: 'box_correct',     label: 'วางกล่องถูกที่ (กล่อง)', type: 'number', pointsPerUnit: 20 },
      { key: 'pingpong_scored', label: 'ยิงลูกปิงปองสำเร็จ', type: 'number', pointsPerUnit: 10 },
      { key: 'landmark_done',   label: 'ภารกิจสัญลักษณ์เมือง (logo)', type: 'boolean', points: 50 },
      { key: 'bridge_crossed',  label: 'ผ่านสะพาน', type: 'boolean', points: 20 }
    ],
    maxTeams: 30, status: 'registration', sortOrder: 14
  },

  // ═══════════════════════════════════════════════════════════════
  // 15-16. หุ่นยนต์บังคับมือ กู้ภัยเมืองศรีสะเกษ 2 รุ่น
  // ═══════════════════════════════════════════════════════════════
  {
    code: 'RESCUE_M15',
    name: 'หุ่นยนต์บังคับมือ กู้ภัยเมืองศรีสะเกษ รุ่นอายุไม่เกิน 15 ปี',
    nameEn: 'Sisaket City Rescue Robot (Manual) U15',
    description: 'หุ่นยนต์บังคับมือช่วยผู้ประสบภัยน้ำท่วม นำอาหาร ยา ช่วยเหลือผู้ประสบภัย',
    category: 'manual', ageGroup: '≤15', scoringType: 'POINT', rankingMethod: 'BEST',
    totalRounds: 1, timePerRoundSeconds: 300, setupTimeSeconds: 30,
    scoringCriteria: [
      { key: 'climbed_stairs',    label: 'ปีนบันไดได้ (20 คะแนน)', type: 'boolean', points: 20 },
      { key: 'start_point_2',     label: 'วางที่จุดเริ่ม 2 ได้ (ไม่ปีน 10 คะแนน)', type: 'boolean', points: 10 },
      { key: 'can_picked',        label: 'หยิบกระป๋องออกจากจุด (กระป๋อง)', type: 'number', pointsPerUnit: 5 },
      { key: 'can_placed',        label: 'วางกระป๋องสำเร็จ (กระป๋อง)', type: 'number', pointsPerUnit: 10 },
      { key: 'pingpong_picked',   label: 'หยิบลูกปิงปอง (ลูก)', type: 'number', pointsPerUnit: 5 },
      { key: 'pingpong_placed',   label: 'วางลูกปิงปองสำเร็จ (ลูก)', type: 'number', pointsPerUnit: 5 },
      { key: 'pvc_passed',        label: 'ผ่านท่อ PVC ครึ่ง', type: 'boolean', points: 20 },
      { key: 'survivor_rescued',  label: 'ช่วยผู้ประสบภัย (ตุ๊กตา)', type: 'boolean', points: 5 },
      { key: 'returned_to_start', label: 'กลับถึงจุดเริ่มต้น', type: 'boolean', points: 50 }
    ],
    maxTeams: 40, status: 'registration', sortOrder: 15
  },
  {
    code: 'RESCUE_MOPEN',
    name: 'หุ่นยนต์บังคับมือ กู้ภัยเมืองศรีสะเกษ รุ่นทั่วไป (ไม่จำกัดอายุ)',
    nameEn: 'Sisaket City Rescue Robot (Manual) Open',
    description: 'หุ่นยนต์บังคับมือช่วยผู้ประสบภัย รุ่นทั่วไป',
    category: 'manual', ageGroup: 'open', scoringType: 'POINT', rankingMethod: 'BEST',
    totalRounds: 1, timePerRoundSeconds: 300, setupTimeSeconds: 30,
    scoringCriteria: [
      { key: 'climbed_stairs',    label: 'ปีนบันไดได้ (20 คะแนน)', type: 'boolean', points: 20 },
      { key: 'start_point_2',     label: 'วางที่จุดเริ่ม 2 ได้ (ไม่ปีน 10 คะแนน)', type: 'boolean', points: 10 },
      { key: 'can_picked',        label: 'หยิบกระป๋องออกจากจุด (กระป๋อง)', type: 'number', pointsPerUnit: 5 },
      { key: 'can_placed',        label: 'วางกระป๋องสำเร็จ (กระป๋อง)', type: 'number', pointsPerUnit: 10 },
      { key: 'pingpong_picked',   label: 'หยิบลูกปิงปอง (ลูก)', type: 'number', pointsPerUnit: 5 },
      { key: 'pingpong_placed',   label: 'วางลูกปิงปองสำเร็จ (ลูก)', type: 'number', pointsPerUnit: 5 },
      { key: 'pvc_passed',        label: 'ผ่านท่อ PVC ครึ่ง', type: 'boolean', points: 20 },
      { key: 'survivor_rescued',  label: 'ช่วยผู้ประสบภัย (ตุ๊กตา)', type: 'boolean', points: 5 },
      { key: 'returned_to_start', label: 'กลับถึงจุดเริ่มต้น', type: 'boolean', points: 50 }
    ],
    maxTeams: 30, status: 'registration', sortOrder: 16
  },

  // ═══════════════════════════════════════════════════════════════
  // 17-18. หุ่นยนต์ Line Fast เจ้าความเร็ว 2 รุ่น
  // ═══════════════════════════════════════════════════════════════
  {
    code: 'LINE_15',
    name: 'หุ่นยนต์ Line Fast "เจ้าความเร็ว" รุ่นอายุไม่เกิน 15 ปี',
    nameEn: 'Line Fast Robot U15',
    description: 'หุ่นยนต์วิ่งตามเส้น ใครทำเวลาน้อยที่สุดชนะ แข่ง 3 รอบ เอาเวลาดีที่สุด',
    category: 'line_following', ageGroup: '≤15', scoringType: 'TIME', rankingMethod: 'BEST',
    totalRounds: 3, timePerRoundSeconds: 180, setupTimeSeconds: 0,
    scoringCriteria: [
      { key: 'checkpoints', label: 'จุดผ่านได้ (1-10)', type: 'number', pointsPerUnit: 0 }
    ],
    maxTeams: 40, status: 'registration', sortOrder: 17
  },
  {
    code: 'LINE_OPEN',
    name: 'หุ่นยนต์ Line Fast "เจ้าความเร็ว" รุ่นทั่วไป (ไม่จำกัดอายุ)',
    nameEn: 'Line Fast Robot Open',
    description: 'หุ่นยนต์วิ่งตามเส้น รุ่นทั่วไป ไม่จำกัดอายุ ไม่จำกัดบอร์ด',
    category: 'line_following', ageGroup: 'open', scoringType: 'TIME', rankingMethod: 'BEST',
    totalRounds: 3, timePerRoundSeconds: 180, setupTimeSeconds: 0,
    scoringCriteria: [
      { key: 'checkpoints', label: 'จุดผ่านได้ (1-10)', type: 'number', pointsPerUnit: 0 }
    ],
    maxTeams: 30, status: 'registration', sortOrder: 18
  }
];

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ เชื่อมต่อ MongoDB สำเร็จ');

    // Clear existing data
    await Competition.deleteMany({});
    await User.deleteMany({});
    console.log('🗑️  ลบข้อมูลเดิมเรียบร้อย');

    // Insert competitions
    const createdComps = await Competition.insertMany(competitions);
    console.log(`✅ สร้างประเภทการแข่งขัน ${createdComps.length} ประเภท`);

    // Create default users
    const users = [
      { username: 'admin', password: 'admin1234', name: 'ผู้ดูแลระบบ', role: 'admin' },
      { username: 'judge1', password: 'judge1234', name: 'กรรมการ 1', role: 'judge' },
      { username: 'judge2', password: 'judge1234', name: 'กรรมการ 2', role: 'judge' },
    ];
    for (const u of users) {
      await User.create(u);
    }
    console.log('✅ สร้างผู้ใช้งานเริ่มต้น (admin/admin1234, judge1/judge1234)');

    console.log('\n🎉 Seed ข้อมูลสำเร็จ! พร้อมใช้งาน');
    console.log('📌 admin login: username=admin, password=admin1234');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed ล้มเหลว:', error.message);
    process.exit(1);
  }
}

seed();
