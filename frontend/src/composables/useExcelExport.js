import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as XLSX from 'xlsx';

export function useExcelExport({
  chainSteps,
  combinedData,
  getFilteredRows,
  getCombinedRows,
  loading,
  loadingText,
}) {
  const exportDialogVisible = ref(false);
  const exportFormat = ref('xlsb');
  const exportOptions = ref({
    includeCombined: true,
    selectedSteps: [],
  });

  function setExportFormat(fmt) {
    exportFormat.value = fmt;
  }

  watch(exportFormat, (newFormat) => {
    if (newFormat !== 'csv') return;

    if (exportOptions.value.includeCombined && chainSteps.value.length > 1) {
      exportOptions.value.selectedSteps = [];
    } else if (exportOptions.value.selectedSteps.length > 0) {
      exportOptions.value.selectedSteps = [exportOptions.value.selectedSteps[0]];
      exportOptions.value.includeCombined = false;
    } else if (chainSteps.value.length > 1) {
      exportOptions.value.includeCombined = true;
    } else {
      exportOptions.value.selectedSteps = [0];
    }
  });

  function openExportDialog() {
    if (!chainSteps.value.length) return;

    exportOptions.value.includeCombined = chainSteps.value.length > 1;
    exportOptions.value.selectedSteps = chainSteps.value.map((_, idx) => idx);
    exportFormat.value = totalSelectedRows.value > 30000 ? 'xlsb' : 'xlsx';
    exportDialogVisible.value = true;
  }

  function setExportPreset(type) {
    if (exportFormat.value === 'csv' && type !== 'combined') {
      exportFormat.value = 'xlsb';
    }

    if (type === 'combined') {
      exportOptions.value.includeCombined = true;
      exportOptions.value.selectedSteps = [];
    } else if (type === 'all') {
      exportOptions.value.includeCombined = chainSteps.value.length > 1;
      exportOptions.value.selectedSteps = chainSteps.value.map((_, idx) => idx);
    } else if (type === 'steps') {
      exportOptions.value.includeCombined = false;
      exportOptions.value.selectedSteps = chainSteps.value.map((_, idx) => idx);
    }
  }

  function toggleStepSelection(idx) {
    if (exportFormat.value === 'csv') {
      exportOptions.value.includeCombined = false;
      exportOptions.value.selectedSteps = [idx];
      return;
    }

    const index = exportOptions.value.selectedSteps.indexOf(idx);
    if (index > -1) {
      exportOptions.value.selectedSteps.splice(index, 1);
    } else {
      exportOptions.value.selectedSteps.push(idx);
    }
  }

  function toggleCombinedSelection() {
    if (exportFormat.value === 'csv') {
      exportOptions.value.includeCombined = true;
      exportOptions.value.selectedSteps = [];
      return;
    }
    exportOptions.value.includeCombined = !exportOptions.value.includeCombined;
  }

  const totalSelectedSheets = computed(() => {
    let count = 0;
    if (exportOptions.value.includeCombined && chainSteps.value.length > 1) count++;
    count += exportOptions.value.selectedSteps.length;
    return count;
  });

  const totalSelectedRows = computed(() => {
    let count = 0;
    if (exportOptions.value.includeCombined && chainSteps.value.length > 1) {
      count += getCombinedRows().length;
    }
    exportOptions.value.selectedSteps.forEach((idx) => {
      count += getFilteredRows(idx).length;
    });
    return count;
  });

  const exportStatusText = computed(() => {
    const rows = totalSelectedRows.value;
    if (exportFormat.value === 'csv') {
      return 'ส่งออกเป็น CSV: เปิดใน Excel ได้เร็วและรองรับภาษาไทย';
    }
    if (exportFormat.value === 'xlsb') {
      return `ส่งออกเป็น Binary (.xlsb): เหมาะกับข้อมูลขนาดใหญ่ (${rows.toLocaleString()} แถว)`;
    }
    if (rows > 1000000) {
      return 'ข้อมูลใกล้หรือเกินขีดจำกัด Excel sheet แนะนำให้ใช้ Binary (.xlsb) หรือ CSV';
    }
    if (rows > 100000) {
      return 'ข้อมูลค่อนข้างใหญ่ .xlsx อาจเปิดช้า แนะนำ Binary (.xlsb) หรือ CSV';
    }
    if (rows > 0) {
      return 'ขนาดข้อมูลเหมาะสม สามารถส่งออกได้ทุก format';
    }
    return 'กรุณาเลือกอย่างน้อย 1 sheet เพื่อส่งออก';
  });

  const exportStatusClass = computed(() => {
    const rows = totalSelectedRows.value;
    if (exportFormat.value === 'csv' || exportFormat.value === 'xlsb') return 'badge-success';
    if (rows > 1000000) return 'badge-danger';
    if (rows > 100000) return 'badge-warning';
    if (rows > 0) return 'badge-success';
    return 'badge-danger';
  });

  function exportAll() {
    openExportDialog();
  }

  function jsonToCsvManual(arr) {
    if (!arr || !arr.length) return '';
    const headers = Object.keys(arr[0]);

    const escapeCell = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const lines = new Array(arr.length + 1);
    lines[0] = headers.map(escapeCell).join(',');

    for (let i = 0; i < arr.length; i++) {
      const row = arr[i];
      const rowCells = new Array(headers.length);
      for (let j = 0; j < headers.length; j++) {
        rowCells[j] = escapeCell(row[headers[j]]);
      }
      lines[i + 1] = rowCells.join(',');
    }
    return lines.join('\r\n');
  }

  function confirmExport() {
    exportDialogVisible.value = false;
    loadingText.value = 'กำลังจัดเตรียมและส่งออกไฟล์...';
    loading.value = true;

    setTimeout(() => {
      try {
        if (exportFormat.value === 'csv') {
          exportCsv();
          return;
        }
        exportWorkbook();
      } catch (e) {
        handleExportError(e);
      } finally {
        loading.value = false;
      }
    }, 100);
  }

  function exportCsv() {
    let csvRows = [];
    let csvName = '';

    if (exportOptions.value.includeCombined && chainSteps.value.length > 1) {
      csvRows = getCombinedRows();
      csvName = 'Combined';
    } else if (exportOptions.value.selectedSteps.length > 0) {
      const originalIdx = exportOptions.value.selectedSteps[0];
      csvRows = getFilteredRows(originalIdx);
      const step = chainSteps.value[originalIdx];
      csvName = `${originalIdx + 1}_${step.tableLabel ?? step.targetTable ?? 'Step'}`;
    }

    if (!csvRows.length) {
      ElMessage.warning('ไม่พบข้อมูลสำหรับแผ่นงานที่เลือก');
      return;
    }

    // สร้าง Blob แบบแบ่งส่วน (Chunked Blob Parts) เพื่อป้องกัน V8 string limit และ memory OOM
    const bom = '\uFEFF';
    const blobParts = [bom];
    const headers = Object.keys(csvRows[0]);

    const escapeCell = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // เขียน Header
    blobParts.push(headers.map(escapeCell).join(',') + '\r\n');

    // ทยอยแปลงข้อมูลทีละ 50,000 แถวเพื่อประหยัดแรม
    const CHUNK_SIZE = 50000;
    for (let i = 0; i < csvRows.length; i += CHUNK_SIZE) {
      const chunk = csvRows.slice(i, i + CHUNK_SIZE);
      const lines = new Array(chunk.length);
      for (let k = 0; k < chunk.length; k++) {
        const row = chunk[k];
        const rowCells = new Array(headers.length);
        for (let j = 0; j < headers.length; j++) {
          rowCells[j] = escapeCell(row[headers[j]]);
        }
        lines[k] = rowCells.join(',');
      }
      blobParts.push(lines.join('\r\n') + '\r\n');
    }

    const blob = new Blob(blobParts, { type: 'text/csv;charset=utf-8;' });
    const fname = `${safeSheetName(csvName)}_${timestamp()}.csv`;
    triggerDownload(blob, fname);

    if (csvRows.length > 1040000) {
      ElMessageBox.alert(
        `ส่งออกไฟล์ CSV "${fname}" สำเร็จ (${csvRows.length.toLocaleString()} แถว)<br/><br/>` +
        `⚠️ <b>ข้อควรระวัง:</b> ข้อมูลชุดนี้มีขนาดใกล้หรือเกินขีดจำกัดสูงสุดของ Excel (1,048,576 แถว) ` +
        `หากเปิดด้วย MS Excel โดยตรง ข้อมูลที่เกินจะถูกตัดและแสดงไม่ครบถ้วน ` +
        `แนะนำให้นำเข้าไฟล์นี้ผ่าน Power BI, Python หรือ Text Editors อื่นๆ เพื่ออ่านข้อมูลทั้งหมด`,
        'ส่งออกสำเร็จแต่เกินขีดจำกัด Excel',
        { dangerouslyUseHTMLString: true, confirmButtonText: 'ตกลง', type: 'warning' }
      );
    } else {
      ElMessage.success(`ส่งออกไฟล์ CSV "${fname}" สำเร็จ (${csvRows.length.toLocaleString()} แถว)`);
    }
  }

  function exportWorkbook() {
    const wb = XLSX.utils.book_new();

    chainSteps.value
      .filter((step, idx) => !step.isCombined && exportOptions.value.selectedSteps.includes(idx))
      .forEach((step) => {
        const originalIdx = chainSteps.value.indexOf(step);
        const rows = getFilteredRows(originalIdx);
        if (!rows.length) return;
        appendJsonSheet(wb, rows, safeSheetName(`${originalIdx + 1}_${step.tableLabel ?? step.targetTable ?? 'Step'}`));
      });

    if (exportOptions.value.includeCombined && chainSteps.value.length > 1) {
      const combinedRows = getCombinedRows();
      if (combinedRows.length) {
        const existingSheets = wb.SheetNames.slice();
        appendJsonSheet(wb, combinedRows, 'Combined');
        wb.SheetNames = ['Combined', ...existingSheets];
      }
    }

    if (wb.SheetNames.length === 0) {
      ElMessage.warning('ไม่พบข้อมูลตามเงื่อนไขการส่งออกที่เลือก');
      return;
    }

    const isBinary = exportFormat.value === 'xlsb';
    const ext = isBinary ? 'xlsb' : 'xlsx';
    const fname = `Traceability_Export_${timestamp()}.${ext}`;
    XLSX.writeFile(wb, fname, isBinary ? { bookType: 'xlsb' } : undefined);
    ElMessage.success(`ส่งออกไฟล์ "${fname}" สำเร็จ - ${wb.SheetNames.length} sheets`);
  }

  function appendJsonSheet(wb, rows, sheetName) {
    const ws = XLSX.utils.json_to_sheet(rows);
    const cols = Object.keys(rows[0]);
    ws['!cols'] = cols.map((col) => ({
      wch: Math.max(col.length + 2, ...rows.slice(0, 50).map((r) => String(r[col] ?? '').length + 1)),
    }));
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  function handleExportError(e) {
    console.error(e);
    if (e instanceof RangeError && (e.message.includes('properties') || e.message.includes('enumerate'))) {
      ElMessageBox.alert(
        'ข้อมูลมีจำนวนเซลล์มากเกินกว่าที่ browser จะสร้าง Excel workbook ได้ กรุณาเลือก CSV with UTF-8 BOM แทน',
        'เกินขีดจำกัดการส่งออก',
        { confirmButtonText: 'ตกลง', type: 'warning' },
      );
      return;
    }
    ElMessage.error(`เกิดข้อผิดพลาดในการส่งออกไฟล์: ${e.message}`);
  }

  function safeSheetName(name) {
    return String(name || 'Sheet').replace(/[:\\/?*[\]]/g, '_').slice(0, 31);
  }

  function timestamp() {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  }

  function triggerDownload(blob, fname) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fname);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return {
    exportDialogVisible,
    exportFormat,
    exportOptions,
    exportStatusClass,
    exportStatusText,
    totalSelectedRows,
    totalSelectedSheets,
    confirmExport,
    exportAll,
    jsonToCsvManual,
    openExportDialog,
    setExportFormat,
    setExportPreset,
    toggleCombinedSelection,
    toggleStepSelection,
  };
}
