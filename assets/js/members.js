/**
 * 將包含「上午/下午」的中文日期字串轉換為 Unix 時間戳記 (秒)
 * @param {string} dateStr - 格式如 "2023/10/24 下午 02:30:00"
 * @returns {number|null} Unix timestamp
 */
function toUnix(dateStr) {
    try {
        if (!dateStr) return null;
        
        const isPm = dateStr.includes("下午");
        const clean = dateStr.replace("下午 ", "").replace("上午 ", "");
        
        // 假設 clean 的格式為 "YYYY/MM/DD HH:MM:SS"
        const parts = clean.split(" ");
        const dateParts = parts[0].split("/");
        const timeParts = parts[1].split(":");

        const year = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1; // JS 的月份是 0-11
        const day = parseInt(dateParts[2], 10);
        
        let hour = parseInt(timeParts[0], 10);
        const minute = parseInt(timeParts[1], 10);
        const second = parseInt(timeParts[2], 10);

        // 處理 12 小時制的 AM/PM 轉換
        if (isPm && hour < 12) {
            hour += 12;
        } else if (!isPm && hour === 12) {
            hour = 0;
        }

        const dt = new Date(year, month, day, hour, minute, second);
        return dt.getTime();
        
    } catch (error) {
        console.error("日期轉換失敗:", error);
        return null;
    }
}

/**
 * 抓取 CSV 並轉換為分類好的 JSON 資料
 * @param {string} url - CSV 檔案的網址
 * @returns {Promise<Object>} 分類整理後的資料物件
 */
async function fetchAndProcessData(url) {
    try {
        // 1. 使用 fetch 取得 CSV 資料
        const response = await fetch(url);
        const csvText = await response.text();

        // 2. 使用 PapaParse 解析 CSV，並回傳 Promise 方便後續非同步處理
        return new Promise((resolve, reject) => {
            Papa.parse(csvText, {
                header: true, // 等同於 pandas 將第一列視為欄位名稱
                skipEmptyLines: true, // 忽略空白行避免解析錯誤
                complete: function(results) {
                    const records = results.data;

                    // 準備回傳的資料結構
                    const data = {
                        time: Date.now(), // 當下時間戳記 (毫秒)，等同 datetime.now().timestamp() * 1000
                        walking: [],
                        healthMale: [],
                        healthFemale: []
                    };

                    // 3. 資料整理
                    records.forEach(record => {
                        // 防呆：確保參加項目欄位有值再進行 split
                        const rawItems = record["參加項目"] || "";
                        
                        const newRecord = {
                            name: record["參賽者暱稱"],
                            time: toUnix(record["時間戳記"]),
                            sex: record["性別"],
                            items: rawItems.split(",").map(item => item.trim()).filter(Boolean) // 拆分並過濾空字串
                        };

                        const sex = newRecord.sex;

                        newRecord.items.forEach(item => {
                            if (item === "健康管理積分賽" && sex === "男") {
                                data.healthMale.push(newRecord);
                            }
                            if (item === "健康管理積分賽" && sex === "女") {
                                data.healthFemale.push(newRecord);
                            }
                            if (item === "健走步數排名賽") {
                                data.walking.push(newRecord);
                            }
                        });
                    });

                    // 回傳整理好的結果
                    resolve(data);
                },
                error: function(error) {
                    reject(error);
                }
            });
        });
    } catch (error) {
        console.error("抓取資料時發生錯誤:", error);
        throw error;
    }
}

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSkaq2Ik8cwrm8KIeGVz_9_2_2iQvOf0wigBfDeW06reolajK5jGn2CkxpI6pwXsV9CD2P1WibZCA2v/pub?gid=305624558&single=true&output=csv';

fetchAndProcessData(csvUrl)
    .then((data) => {
        const { walking, healthMale, healthFemale } = data;

        const walkingEl = document.getElementById('walking');
        if (walkingEl) {
            walkingEl.innerHTML = walking.length;
            walkingEl.style.color = walking.length >= 18 ? 'var(--blue)' : 'var(--red)';
        }
        
        const healthMaleEl = document.getElementById('health-male');
        if (healthMaleEl) {
            healthMaleEl.innerHTML = healthMale.length;
            healthMaleEl.style.color = healthMale.length >= 1 ? 'var(--blue)' : 'var(--red)';
        }
        
        const healthFemaleEl = document.getElementById('health-female');
        if (healthFemaleEl) {
            healthFemaleEl.innerHTML = healthFemale.length;
            healthFemaleEl.style.color = healthFemale.length >= 9 ? 'var(--blue)' : 'var(--red)';
        }
    })
    .catch(err => {
        console.error("處理失敗:", err);
    });;
