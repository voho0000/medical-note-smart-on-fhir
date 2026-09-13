# HFrEF 模擬病人

每個 JSON 檔都是可單獨匯入的 FHIR Bundle，且只包含一位虛構病人。

| 檔案 | 情境 | 主要辨識點 |
| --- | --- | --- |
| `01-stable-four-pillars.json` | 穩定、四大支柱已建立 | LVEF 35%，生命徵象與腎功能穩定，無明顯鬱血 |
| `02-congested-needs-diuresis.json` | 鬱血、需調整利尿 | LVEF 28%，低血氧、低血鈉、NT-proBNP 升高及胸部 X 光鬱血徵象 |
| `03-renal-hyperkalemia.json` | 腎功能下降及高血鉀 | LVEF 30%，eGFR 24、K 5.6，未使用 MRA |
| `04-hypotension-bradycardia.json` | 低血壓及心搏過緩 | LVEF 25%，血壓 86/54、心率 44，需重新評估 ARNI 與 β 阻斷劑耐受性 |

需要重新產生檔案時，在專案根目錄執行：

```sh
npm run demo:hf-cases
```

所有姓名、識別碼、日期與臨床資料均為測試用途的虛構內容。
