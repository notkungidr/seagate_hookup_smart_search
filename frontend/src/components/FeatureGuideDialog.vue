<template>
  <el-dialog
    :model-value="modelValue"
    title="🚀 ทำเนียบฟีเจอร์และคู่มือระบบ (System Feature Catalog & User Manual)"
    width="85%"
    class="features-dialog"
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="ft-dialog-content">
      <!-- Banner: Glowing Header -->
      <div class="ft-banner">
        <div class="ft-banner-icon">🚀</div>
        <div class="ft-banner-text">
          <h3>Smart Pivot Search — System is evolving daily!</h3>
          <p>
            สรุปความสามารถและฟีเจอร์ทั้งหมดของระบบสืบค้นประวัติย้อนกลับสายการผลิต (Traceability) 
            หน้านี้คือสารบัญฟีเจอร์ที่ท่านสามารถย้อนกลับมาอ่านและทบทวนความเข้าใจการทำงานได้ทุกเวลา
          </p>
        </div>
      </div>

      <!-- Feature Grid: 4 Premium Categories -->
      <div class="ft-categories-grid">
        
        <!-- Category 1: Core Traceability -->
        <div class="ft-category-card">
          <div class="ft-category-header color-blue">
            <span class="cat-icon">⛓️</span>
            <h4>1. Core Drill-Down (ระบบสืบค้นและเชื่อมโยงหลัก)</h4>
          </div>
          <div class="ft-list">
            <div class="ft-item">
              <div class="ft-item-title">
                <strong>สืบค้นแบบต่อยอดขั้นบันได (Drill-Down Search)</strong>
                <el-tag size="small" type="primary" effect="dark">Core</el-tag>
              </div>
              <p>แทนที่จะโหลดข้อมูลสายการผลิตทั้งหมดทีเดียวซึ่งเสี่ยงต่อเซิร์ฟเวอร์ล่ม ระบบจะใช้การสืบค้นไปทีละกระบวนการ (Step) แล้วนำผลลัพธ์ที่ได้ (Join Key) Pivot ข้ามตารางไปสืบค้นต่อ ช่วยให้ทำงานเร็วระดับมิลลิวินาที</p>
            </div>
            <div class="ft-item">
              <div class="ft-item-title">
                <strong>แผนภาพทิศทางต้นไม้ (Visual Branching Tree)</strong>
                <el-tag size="small" type="primary" effect="plain">UI/UX</el-tag>
              </div>
              <p>แสดงการเชื่อมโยงของแต่ละ Step (Step 1 ➔ Step 2 ➔ Step 3) ในรูปแบบแผนภาพเส้นทางแนวนอน พร้อมบอกจำนวนแถว คีย์ที่ใช้เชื่อมต่อ (`Join Key`) และแสดงแถบสีเมื่อสลับการเลือกดูอย่างง่ายดาย</p>
            </div>
            <div class="ft-item">
              <div class="ft-item-title">
                <strong>การแตกกิ่งขนาน (Parallel Pivot Branching)</strong>
                <el-tag size="small" type="warning" effect="dark">Advanced</el-tag>
              </div>
              <p>รองรับการ Pivot แตกกิ่งข้อมูลแบบขนาน (เช่น จาก Step 2 สามารถแยกสืบค้นไปยัง Step 3 หรือกระบวนการอื่นคู่ขนานกันได้) โดยระบบจะแสดงไอคอนสัญลักษณ์ `⌥` สีม่วงบนการ์ดอย่างเด่นชัด</p>
            </div>
          </div>
        </div>

        <!-- Category 2: Combined View & Analysis -->
        <div class="ft-category-card">
          <div class="ft-category-header color-green">
            <span class="cat-icon">📊</span>
            <h4>2. Combined View & Analysis (การรวมตารางและการวิเคราะห์)</h4>
          </div>
          <div class="ft-list">
            <div class="ft-item">
              <div class="ft-item-title">
                <strong>ตารางรวมผลลัพธ์อัตโนมัติ (Auto-Joined Combined View)</strong>
                <el-tag size="small" type="success" effect="dark">Combined</el-tag>
              </div>
              <p>เมื่อเชื่อมโยงข้อมูลตั้งแต่ 2 ขั้นตอนขึ้นไป ระบบจะประมวลผลทำ <strong>Left-Join แนวนอนให้โปรแกรมเมอร์อัตโนมัติ</strong> เพื่อรวมข้อมูลทุก Step มาแสดงในตารางเดียวกันอย่างต่อเนื่อง</p>
            </div>
            <div class="ft-item">
              <div class="ft-item-title">
                <strong>การสลับแกนตารางหลัก (Master Axis Selector)</strong>
                <el-tag size="small" type="success" effect="plain">Dynamic</el-tag>
              </div>
              <p>ผู้ใช้สามารถเลือกปรับเปลี่ยน "แกนตารางหลัก (Left-Join Master Axis)" ได้เองในแถบหัวตารางรวม โดยระบบจะอิงแถวของตารางหลักนั้นเป็นหลัก หรือให้ระบบคำนวณอัตโนมัติให้ได้ (`⚡ Auto` อิงตารางที่มีจำนวนแถวสูงสุด)</p>
            </div>
            <div class="ft-item">
              <div class="ft-item-title">
                <strong>ตัวเลือกคอลัมน์คัดกรอง (Column Selector Popover)</strong>
                <el-tag size="small" type="info" effect="dark">Optimize</el-tag>
              </div>
              <p>คลิกปุ่ม `⚙️ เลือกคอลัมน์` เพื่อเอาคอลัมน์ที่ไม่เกี่ยวข้องออก คอลัมน์ที่ไม่ได้เลือกจะถูกซ่อนจากมุมมองหน้าเว็บ ถูกคัดออกจากการส่งออก Excel/CSV และถูกตัดออกจาก API Payload เพื่อความรวดเร็ว</p>
            </div>
          </div>
        </div>

        <!-- Category 3: Ergonomics & UX (การใช้งานที่ลื่นไหลและเสถียรภาพ) -->
        <div class="ft-category-card">
          <div class="ft-category-header color-orange">
            <span class="cat-icon">✋</span>
            <h4>3. Ergonomics & UX (การใช้งานที่ลื่นไหลและเสถียรภาพ)</h4>
          </div>
          <div class="ft-list">
            <div class="ft-item">
              <div class="ft-item-title">
                <strong>คลิกคัดลอกเซลล์ข้อมูลด่วน (Copy Cell on Click)</strong>
                <el-tag size="small" type="success" effect="dark">Premium ⚡</el-tag>
              </div>
              <p>คลิกเซลล์ใดก็ได้ที่มีข้อมูลในทุกตารางเพื่อก๊อปปี้คีย์เข้า Clipboard ทันที พร้อม Toast สีเขียวสั้น 1.5 วินาที โดยระบบฉลาดพอที่จะปิดการทำงานเมื่อตรวจพบการลากคลุมคลุมตัวหนังสือ (Drag selection detection) เพื่อไม่ให้สลัดก๊อปปี้ทับข้อความดั้งเดิม</p>
            </div>
            <div class="ft-item">
              <div class="ft-item-title">
                <strong>ตรึงคอลัมน์ซีเรียลหลัก (Sticky SN Column)</strong>
                <el-tag size="small" type="primary" effect="dark">UI/UX</el-tag>
              </div>
              <p>ตรึงคอลัมน์แรกที่เป็นซีเรียล/คีย์หลักด้านซ้ายมือเสมอเมื่อ Scroll แนวนอน ในตาราง Combined View และตารางย่อย มีขอบเงาตั้งและสีพื้นหลังทึบแสง 100% (Solid background) ป้องกันการซ้อนทับกันของข้อความในทุกๆ โหมด</p>
            </div>
            <div class="ft-item">
              <div class="ft-item-title">
                <strong>ตัวกรองภายในกล่อง (Filter in Box)</strong>
                <el-tag size="small" type="warning" effect="plain">Lazy Load</el-tag>
              </div>
              <p>ผู้ใช้สามารถพิมพ์กรองคำภายในตารางแต่ละขั้นตอนได้อย่างอิสระผ่านกล่อง `Filter in this box...` และเมื่อกด Pivot ระบบจะส่งเฉพาะข้อมูลที่ผ่านตัวกรองแล้วไปสืบค้นต่อ ทำให้รวดเร็วและแคบลง</p>
            </div>
          </div>
        </div>

        <!-- Category 4: Integrations & API -->
        <div class="ft-category-card">
          <div class="ft-category-header color-purple">
            <span class="cat-icon">🔌</span>
            <h4>4. Integrations & API (การส่งออกและการเชื่อมต่อภายนอก)</h4>
          </div>
          <div class="ft-list">
            <div class="ft-item">
              <div class="ft-item-title">
                <strong>ส่งออก Excel แบบหลายชีท และ UTF-8 BOM CSV</strong>
                <el-tag size="small" type="purple" effect="dark">Export</el-tag>
              </div>
              <p>สามารถดาวน์โหลดรายงานแยกชีทแต่ละกระบวนการพร้อมรวมชีท Combined หรือกรณีข้อมูลขนาดใหญ่สามารถโหลดแบบ CSV (พร้อมลงทะเบียน UTF-8 BOM สำหรับภาษาไทยใน Excel) เพื่อความรวดเร็วและไม่ค้าง</p>
            </div>
            <div class="ft-item">
              <div class="ft-item-title">
                <strong>สร้าง Endpoint ดึงข้อมูล (Save as API)</strong>
                <el-tag size="small" type="success" effect="dark">API Service</el-tag>
              </div>
              <p>คลิกบันทึกขั้นตอนสืบค้นทั้งหมดเพื่อสร้าง **GET REST API Endpoint** สำหรับให้ Power BI หรือโปรแกรมวิเคราะห์ข้อมูลอื่นๆ เรียกใช้โดยตรงผ่าน URL ไม่ต้องทำขั้นตอนการกดในเว็บใหม่</p>
            </div>
            <div class="ft-item">
              <div class="ft-item-title">
                <strong>กำหนดพารามิเตอร์ดรอปดาวน์ดึงข้อมูล (API Multi-Params)</strong>
                <el-tag size="small" type="success" effect="plain">Active</el-tag>
              </div>
              <p>รองรับการเลือกคอลัมน์ใดๆ ในกระบวนการทั้งหมดมาทำหน้าที่เป็นพารามิเตอร์ดึงข้อมูลใน API URL ได้อย่างอิสระ (เช่น ส่งพารามิเตอร์แยกตามวันที่ `date`, `S2_DATE`, หรือ `S3_DATE` ของแต่ละขั้นการผลิต) เพื่อรองรับเครื่องมือดึงข้อมูลภายนอกอย่างเต็มรูปแบบ</p>
            </div>
            <div class="ft-item">
              <div class="ft-item-title">
                <strong>ระบบจัดการ API และ Swagger UI เอกสารโค้ดเชิงลึก</strong>
                <el-tag size="small" type="danger" effect="dark">New ✨</el-tag>
              </div>
              <p>เพิ่มปุ่ม **API Manager (จัดการ API Endpoints)** เพื่อพรีวิวตารางข้อมูล, ปรับเปลี่ยนพารามิเตอร์แบบ Interactive, คัดลอกลิงก์ CSV ไปยัง PowerBI/Excel, และดึงโค้ด Integration สำเร็จรูปใน Python (Pandas) / JavaScript / cURL ทันที พร้อมระบบ Swagger UI ดูเอกสาร static API ทั้งหมดที่ `/swagger`</p>
            </div>
          </div>
        </div>

        <!-- Category 5: Smart API Directory & RBAC Security Suite -->
        <div class="ft-category-card span-full">
          <div class="ft-category-header color-rose">
            <span class="cat-icon">🔒</span>
            <h4>5. Smart API Directory & RBAC Security Suite (ความปลอดภัยและการควบคุมสิทธิ์)</h4>
          </div>
          <div class="ft-list ft-list-grid">
            <div class="ft-item">
              <div class="ft-item-title">
                <strong>การจัดกลุ่มแผนก/ประเภท (API Grouping & Department Tags)</strong>
                <el-tag size="small" type="danger" effect="dark">New ✨</el-tag>
              </div>
              <p>คัดกรองจัดกลุ่ม API แยกตามแผนกจริง เช่น `Yield Tracking`, `Coil Traceability`, `PCCA Rework`, `Logistics` ช่วยลดยอดรายการคิวรีในหน้าแรกให้เป็นระเบียบชัดเจน ค้นหาง่ายด้วยแท็บประเภท</p>
            </div>
            <div class="ft-item">
              <div class="ft-item-title">
                <strong>ควบคุมสิทธิ์ผู้เข้าชม (Access Control Visibility)</strong>
                <el-tag size="small" type="danger" effect="dark">New ✨</el-tag>
              </div>
              <p>ผู้สร้างสามารถเลือกเปิดสิทธิ์ API เป็นแบบ `🌍 Public` (สาธารณะ) หรือจำกัดให้เฉพาะหมายเลขพนักงานที่กำหนด `🔒 Restricted` (จำกัดสิทธิ์เฉพาะบุคคล) เท่านั้นที่สามารถมองเห็นและเรียกใช้ได้</p>
            </div>
            <div class="ft-item">
              <div class="ft-item-title">
                <strong>กล่องค้นหารหัสพนักงานอัจฉริยะ (Allowed EN Autocomplete)</strong>
                <el-tag size="small" type="danger" effect="plain">Security Bypass</el-tag>
              </div>
              <p>กล่องเพิ่มสิทธิ์มาพร้อมระบบดึงข้อมูลรายชื่อพนักงานอัตโนมัติ (Dynamic Autocomplete) เพียงพิมพ์รหัส EN หรือชื่อบางส่วน ระบบจะนำทางคิวรีค้นหาคนในองค์กรให้ทันที สะดวกและรวดเร็ว</p>
            </div>
            <div class="ft-item">
              <div class="ft-item-title">
                <strong>หน้ากระดานทรายทดลองใช้งาน (Consumer Sandbox Playground)</strong>
                <el-tag size="small" type="warning" effect="dark">Premium ⚡</el-tag>
              </div>
              <p>ผู้ใช้ทั่วไป (Consumer) จะเข้าถึง API ในรูปแบบ Read-Only ปลอดภัยสูง (ไม่มีปุ่มสร้าง/แก้ไข/ลบ API) โดยสามารถปรับแต่งค่าพารามิเตอร์ กดรันคิวรีสดพรีวิวตารางข้อมูล เล่น Swagger และดาวน์โหลด Excel/CSV รายงานทันที</p>
            </div>
          </div>
        </div>

      </div>

      <!-- Changelog / Timeline Section -->
      <div class="ft-changelog-section">
        <span class="changelog-title">📋 ไทม์ไลน์บันทึกการอัปเกรดระบบ (System Upgrade Logs)</span>
        <div class="timeline">
          <div class="timeline-event">
            <div class="event-dot" style="background: #10b981; box-shadow: 0 0 0 2px #34d399;"></div>
            <div class="event-header">
              <span class="event-date">29 พฤษภาคม 2026 (ล่าสุด ✨)</span>
              <span class="event-badge badge-new" style="background: #ecfdf5; color: #047857;">QA Productivity & Ergonomics Suite</span>
            </div>
            <p class="event-desc">
              <strong>QA Productivity Suite — Access Boost & Ergonomics:</strong>
              <br>
              1. ⚡ <strong>Quick Date Presets (ปุ่มลัดวันที่คลิกเดียว):</strong> ปุ่มลัด วันนี้, เมื่อวาน, 7 วัน, 30 วัน, เดือนนี้ ใต้ช่องเลือกวันที่ อำนวยความสะดวกให้ QA ทำงานได้ทันทีโดยไม่ต้องเปิดและเลือกปฏิทินหลายรอบ
              <br>
              2. 🕒 <strong>Search History Tracker (แถบประวัติค้นหาด่วน):</strong> บันทึกประวัติการค้นหาล่าสุดสูงสุด 20 รายการลง LocalStorage ให้กดปุ่ม <strong>"▶ ค้นซ้ำ"</strong> เพื่อนำการตั้งค่าเงื่อนไขเดิมกลับมารันคิวรีใหม่ได้ในเสี้ยววินาที
              <br>
              3. 📋 <strong>Quick Paste Box & Custom Rules (กล่องวางรหัสด่วนอัจฉริยะ):</strong> วางรหัส SN/Lot จากแชต/อีเมล แล้วจัดส่งเข้าฟอร์มสืบค้นไปยิงยังตารางและคอลัมน์ที่ตรงกัน (Routing) โดยอัตโนมัติ พร้อมสลับเส้นทางนำร่องเมื่อ Match ชนกัน (Multi-Routing Selector)
              <br>
              4. 📥 <strong>Drag & Drop CSV/TXT Search (ระบบลากวางไฟล์ข้อมูลมหาศาล):</strong> ลากไฟล์ CSV/TXT ข้อมูลชุดใหญ่ (ซีเรียล 10,000 - 350,000 แถว) มาวางในช่อง Quick Paste เพื่อสืบค้นข้อมูลมหาศาลโดยพักเข้าหน่วยความจำเพื่อป้องกันอาการเบราว์เซอร์หน่วง/ค้างได้อย่างสมบูรณ์
              <br>
              5. 📋 <strong>Copy Cell on Click (คลิกคัดลอกเซลล์ด่วน):</strong> คลิกเซลล์ข้อมูลใดๆ ในตารางเพื่อบันทึกเข้า Clipboard ทันทีด้วย Pointer Cursor พร้อม Toast สีเขียวสั้น 1.5 วินาที โดยรองรับการตรวจจับไฮไลต์ตัวอักษร (Drag selection detection) เพื่อไม่ให้สลัดก๊อปปี้ทับข้อความดั้งเดิม และข้ามค่า null/empty ให้อัตโนมัติ
              <br>
              6. 📌 <strong>Sticky SN Columns (ตรึงคอลัมน์คีย์หลักแนวนอน):</strong> ตรึงคอลัมน์แรกสุดที่เป็นตัวยึดข้อมูลหลัก (SN หรือ Hookup) ให้อยู่กับที่ทางด้านซ้ายมือเสมอเมื่อ Scroll แนวนอน มีขอบเงาตั้งและสีพื้นหลังทึบแสง 100% ป้องกันการซ้อนทับกันของข้อความในทุกๆ โหมด (Striped & Hover highlights compatible)
            </p>
          </div>
          <div class="timeline-event">
            <div class="event-dot" style="background: #3b82f6; box-shadow: 0 0 0 2px #93c5fd;"></div>
            <div class="event-header">
              <span class="event-date">28 พฤษภาคม 2026</span>
              <span class="event-badge badge-new" style="background: #eff6ff; color: #1d4ed8;">Bidirectional Chain Replay</span>
            </div>
            <p class="event-desc">
              <strong>Bidirectional Pivot Engine from Any Start Step (สืบค้นย้อนกลับสองทิศทางจากขั้นตอนใดก็ได้):</strong>
              1. 🎯 <strong>เปลี่ยนตารางเริ่มต้นแม่แบบอิสระ (Start Step Selection):</strong> วิศวกรสามารถคลิกเลือกขั้นตอน (Pill Card) ใดในหน้าประมวลผลแม่แบบเพื่อใช้เป็นขั้นตอนตั้งต้นในการค้นหาเงื่อนไขได้ทันที โดยตารางฟิลด์และคอลัมน์ในการป้อนเงื่อนไขด้านล่างจะปรับเปลี่ยนตามขั้นตอนที่เลือกอัตโนมัติ
              2. 🔄 <strong>คิวรีสืบค้นย้อนรอยสองทิศทาง (BFS Bidirectional Engine):</strong> เพิ่มระบบประมวลผล BFS ท่องความสัมพันธ์ใน Composables เพื่อทำ Pivot ย้อนรอยย้อนกลับ (Backward) ไปยังขั้นตอนแรก และสืบค้นต่อไปข้างหน้า (Forward) ไปยังขั้นตอนท้ายพร้อมกันอัตโนมัติในครั้งเดียว
              3. 🎨 <strong>ความหรูหราแบบ Glassmorphic (Glowing Selection):</strong> ออกแบบสถานะ Pill ของตารางหลักให้มีขอบแสงสีเขียวเรืองรอง (`#67c23a` neon glow) สวยงามสอดคล้องกับ UI ระบบที่ล้ำสมัย
            </p>
          </div>
          <div class="timeline-event">
            <div class="event-dot" style="background: #10b981; box-shadow: 0 0 0 2px #a7f3d0;"></div>
            <div class="event-header">
              <span class="event-date">28 พฤษภาคม 2026</span>
              <span class="event-badge badge-new" style="background: #ecfdf5; color: #047857;">Security & Sandbox Suite</span>
            </div>
            <p class="event-desc">
              <strong>Smart API Directory & RBAC Security Suite & Consumer Sandbox Mode:</strong>
              1. 🔒 <strong>ระบบสิทธิ์การเข้าใช้งานแบบละเอียด (RBAC Endpoints):</strong> ผู้สร้าง API (Admin หรือ Owner) สามารถตั้งค่าสิทธิ์ให้เป็น `🌍 สาธารณะ (Public)` หรือ `🔒 จำกัดสิทธิ์เฉพาะกลุ่ม (Restricted)` ได้ใน 2 คลิก ป้องกันการรั่วไหลของข้อมูลความลับ
              2. 👥 <strong>กล่องค้นหาพนักงานอัจฉริยะ (Allowed EN Autocomplete):</strong> เชื่อมต่อกับระบบข้อมูลพนักงานด้วยการค้นหารหัสพนักงาน (EN) หรือชื่อแบบเรียลไทม์ผ่าน API โดยมีการตรวจสอบสิทธิ์ด้านความปลอดภัยอย่างเข้มข้นเฉพาะผู้พัฒนาที่ลงชื่อใช้งานจริงเท่านั้น
              3. 🎮 <strong>หน้ากระดานทรายทดลองอ่านอย่างเดียว (Consumer Read-Only Playground):</strong> ออกแบบมุมมองสำหรับผู้ใช้ทั่วไป (Consumer) แบบพิเศษโดยตัดปุ่ม CRUD (สร้าง/แก้ไข/ลบ API) ทั้งหมดออก เพื่อแสดงผลเฉพาะเมนู Sandbox ในการกรอกพารามิเตอร์สืบค้นข้อมูล ดูตารางพรีวิว เชื่อมต่อโค้ด และสั่งออกไฟล์รายงานอย่างปลอดภัย
              4. ⚡ <strong>MySQL 5.0.0 Automatic Migration Hook:</strong> เสริมประสิทธิภาพการ Migrate โครงสร้างฐานข้อมูลอัตโนมัติบนเซิร์ฟเวอร์ Elysia ตรวจสอบและสร้างตารางสิทธิ์ `endpoint_permissions` และคอลัมน์ใหม่ปลอดภัยทุกขั้นตอน
            </p>
          </div>
          <div class="timeline-event">
            <div class="event-dot"></div>
            <div class="event-header">
              <span class="event-date">27 พฤษภาคม 2026</span>
              <span class="event-badge badge-new">Latest Update</span>
            </div>
            <p class="event-desc">
              <strong>Two-Phase Filter Sweep, Date Isolation & Dynamic Schema Stability Engine:</strong> 
              1. 🚀 <strong>Two-Phase Filter Sweep Backend Engine:</strong> พัฒนาระบบประมวลผล Backward Keys Propagation ย้อนกลับความเร็วสูงระดับมิลลิวินาที ทำให้สามารถป้อนเงื่อนไขค้นหาผ่านช่องทางใดก็ได้จากทั้ง 7 คอลัมน์ข้ามเซิร์ฟเวอร์ โดยระบบจะไล่ค้นหาจากปลายกิ่งและกรองไขว้กลับมาหาตารางหลักแบบอัตโนมัติอย่างถูกต้อง
              2. 🛠️ <strong>Dynamic Join Alias Fallback (เสถียรภาพสกีมา):</strong> แก้ไขบั๊กคอลัมน์ร่วม (เช่น `lot_coil`) หายไปเมื่อเปลี่ยนแกนตารางหลักตามจำนวนข้อมูลหลังบ้าน (Programmatic Join Master Axis) โดยเพิ่มกลไกย้อนกลับแมปฟิลด์ที่มีพรีฟิกซ์ (เช่น `S1_lot_coil`) คืนสู่คีย์หลักที่ระบุในเทมเพลต ทำให้โครงสร้าง API มีความเสถียรและแสดงผลข้อมูลครบถ้วน 100% เสมอ
              3. 📅 <strong>Isolate Template Dates:</strong> ละเว้นและทำความสะอาดตัวกรองวันที่ที่ติดมาจากเทมเพลต (`reg` / `upd`) โดยอัตโนมัติ หากไม่มีการส่งพารามิเตอร์วันที่จริงผ่าน URL ป้องกันไม่ให้ประวัติข้อมูลย้อนกลับถูกปิดกั้น
              4. 🔎 <strong>Navicat SQL Database Logger:</strong> ปรับปรุงระบบ Log แสดงคำสั่งคิวรี SQL บนหน้าต่างหลังบ้านให้แสดงชื่อ Target Database / Schema ตรงๆ ทำให้ผู้พัฒนาคัดลอกคำสั่งไปใช้ตรวจสอบและวิเคราะห์โครงสร้างตารางข้ามเซิร์ฟเวอร์บน Navicat ได้ง่ายดายขึ้น
            </p>
          </div>
          <div class="timeline-event">
            <div class="event-dot"></div>
            <div class="event-header">
              <span class="event-date">26 พฤษภาคม 2026</span>
              <span class="event-badge">API Manager</span>
            </div>
            <p class="event-desc">
              <strong>Elysia Swagger UI & API Manager Dashboard (GET/POST Dual Engine):</strong> 
              1. เพิ่มปลั๊กอิน **Elysia Swagger UI** ดูเอกสารวิเคราะห์และทดลองยิง API หลักทั้งหมดได้ทาง `/swagger`
              2. สร้างหน้าจอ **API Manager (จัดการ API Endpoints)** หน้าบ้าน สามารถดึงรายการ API และลบออกได้อย่างอิสระ
              3. พัฒนาช่อง Allowed Parameters เป็น **Textarea ขยายตัวอัตโนมัติ (Autosize)** เพื่อให้ผู้ใช้งานวางคีย์ค้นหาครั้งละจำนวนมาก (Bulk Inputs เช่น serials/lots หลายสิบหลายร้อยแถวคั่นด้วยเว้นวรรค/ขึ้นบรรทัดใหม่)
              4. รองรับ **Dual API Engine** สามารถเรียกใช้งาน Endpoint ร่วมกันได้ทั้งช่องทาง **GET** (รับ Query Params) และช่องทาง **POST** (รับ JSON Body Payload เพื่อความง่ายในการเชื่อมระบบภายนอกเชิงสากล) โดยระบบหลังบ้านคัดกรองข้อมูลด้วยคำสั่ง `IN` ความเร็วสูง batched ครั้งละ 1000 รายการอย่างเสถียร
            </p>
          </div>
          <div class="timeline-event">
            <div class="event-dot"></div>
            <div class="event-header">
              <span class="event-date">25 พฤษภาคม 2026</span>
              <span class="event-badge">Dynamic API</span>
            </div>
            <p class="event-desc">
              อัปเกรดให้หน้าต่างการเซฟ API สามารถ **เลือกคอลัมน์ของทุกตารางมาเป็นพารามิเตอร์ (Allowed Parameters)** ได้อย่างยืดหยุ่น เช่น ใส่พารามิเตอร์กรองตามวันที่ย่อยรายกระบวนการ (date, S2_DATE, S3_DATE) พร้อมอัปเดต API ส่งคืนผลลัพธ์เป็น Flat Table Left-Joined สอดคล้องกับหน้าเว็บ 100%
            </p>
          </div>
          <div class="timeline-event">
            <div class="event-dot"></div>
            <div class="event-header">
              <span class="event-date">24 พฤษภาคม 2026</span>
              <span class="event-badge badge-optimize">Performance</span>
            </div>
            <p class="event-desc">
              เพิ่มฟีเจอร์ **Column Selector & Column Picker** ย่อ-ขยายคอลัมน์ in หน้าจอรวม พร้อมสร้างกลไก **Capping Distinct Values ไว้ที่ 500** เพื่อแก้ไขปัญหาการโหลดข้อมูลตัวเลือกฟิลเตอร์ค้างสำหรับตารางข้อมูลหลักแสนแถว
            </p>
          </div>
          <div class="timeline-event">
            <div class="event-dot"></div>
            <div class="event-header">
              <span class="event-date">22 พฤษภาคม 2026</span>
              <span class="event-badge">Core Engine</span>
            </div>
            <p class="event-desc">
              วางระบบการทำ **Left-Join แบบ Dynamic บนหน้าเว็บ** และสร้างตัวเลือก **Master Axis (แกนหลัก Left-Join)** แบบอัตโนมัติ ช่วยลดปัญหา WIP สูญหายและการแสดงผลข้อมูลไม่ครบถ้วน
            </p>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button type="success" size="large" style="min-width: 160px; font-weight: bold;" @click="$emit('update:modelValue', false)">
          เข้าใจแล้ว (Close Guide)
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, required: true },
});

defineEmits(['update:modelValue']);
</script>

<style scoped>
:deep(.features-dialog) {
  border-radius: 16px !important;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25) !important;
  overflow: hidden;
}
:deep(.features-dialog .el-dialog__header) {
  background: linear-gradient(135deg, hsl(220, 80%, 15%) 0%, hsl(230, 75%, 10%) 100%);
  margin-right: 0;
  padding: 22px 28px;
}
:deep(.features-dialog .el-dialog__title),
:deep(.features-dialog .el-dialog__headerbtn .el-dialog__close) {
  color: white !important;
}
:deep(.features-dialog .el-dialog__title) {
  font-weight: 700;
  font-size: 1.3rem;
}
:deep(.features-dialog .el-dialog__body) {
  padding: 28px !important;
  background: #f8fafc;
}
.ft-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 8px;
}
.ft-banner {
  display: flex;
  align-items: center;
  gap: 18px;
  background: linear-gradient(135deg, #e0f2fe, #bae6fd);
  padding: 20px 24px;
  border-radius: 12px;
  border-left: 6px solid #0284c7;
  box-shadow: 0 4px 12px rgba(2, 132, 199, 0.08);
}
.ft-banner-icon {
  font-size: 2.5rem;
  background: white;
  padding: 10px 16px;
  border-radius: 50%;
  box-shadow: 0 6px 16px rgba(2, 132, 199, 0.15);
}
.ft-banner-text h3 {
  margin: 0 0 6px;
  font-size: 1.2rem;
  font-weight: 700;
  color: #0f172a;
}
.ft-banner-text p {
  margin: 0;
  font-size: 0.9rem;
  color: #334155;
  line-height: 1.6;
}
.ft-categories-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.ft-category-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
}
.ft-category-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 2px solid #f1f5f9;
}
.cat-icon {
  font-size: 1.4rem;
}
.ft-category-header h4 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}
.color-blue h4 { color: #0284c7; }
.color-green h4 { color: #16a34a; }
.color-orange h4 { color: #ea580c; }
.color-purple h4 { color: #7c3aed; }
.color-rose h4 { color: #db2777; }

.span-full {
  grid-column: span 2;
}

.ft-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.ft-list-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.ft-item {
  background: #f8fafc;
  border-radius: 8px;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
}
.ft-item-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.ft-item-title strong {
  font-size: 0.9rem;
  color: #1e293b;
}
.ft-item p {
  margin: 0;
  font-size: 0.82rem;
  color: #64748b;
  line-height: 1.5;
}

.ft-changelog-section {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}
.changelog-title {
  display: block;
  font-size: 1rem;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 18px;
  border-bottom: 2.5px solid #e2e8f0;
  padding-bottom: 6px;
}
.timeline {
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: relative;
  padding-left: 20px;
}
.timeline::before {
  content: '';
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 5px;
  width: 2px;
  background: #cbd5e1;
}
.timeline-event {
  position: relative;
}
.event-dot {
  position: absolute;
  left: -20px;
  top: 4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #3b82f6;
  border: 2px solid white;
  box-shadow: 0 0 0 2px #93c5fd;
}
.event-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.event-date {
  font-size: 0.85rem;
  font-weight: 700;
  color: #0f172a;
}
.event-badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #475569;
}
.badge-new {
  background: #dbeafe;
  color: #1d4ed8;
}
.badge-optimize {
  background: #ffedd5;
  color: #c2410c;
}
.event-desc {
  margin: 0;
  font-size: 0.82rem;
  color: #475569;
  line-height: 1.5;
}

@media (max-width: 1024px) {
  .ft-categories-grid {
    grid-template-columns: 1fr;
  }
  .span-full {
    grid-column: span 1;
  }
}
@media (max-width: 768px) {
  .ft-list-grid {
    grid-template-columns: 1fr;
  }
}
</style>
