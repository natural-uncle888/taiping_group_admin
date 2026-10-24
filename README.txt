太平人大小事｜社團管理中心 v0.2.2

本版定位
- 這是 v0.2 的正式化修正版，仍是「社團管理輔助工具」，不會直接操作 Facebook 的貼文、禁言、踢出或封鎖。
- 沒有設定 Supabase 時仍可進入展示模式；展示資料只保存在目前瀏覽器，不適合保存真實社員個資或正式案件。

v0.2.1 修正內容
1. 修正公開檢舉／申訴表單的資料庫送出方式：改走 Supabase RPC，避免因匿名使用者沒有資料表 SELECT 權限而在 insert().select() 階段失敗。
2. 檢舉與申訴由資料庫產生案件編號，並儲存到 reports.case_code / appeals.case_code。
3. SQL 加入欄位長度與選項驗證，並移除公開直接 INSERT 資料表的政策；公開提交改由受限 RPC 執行。
4. 加入蜜罐欄位、前端短時間重送限制，以及資料庫端來源 IP 雜湊限速（可辨識來源 IP 時，每個 IP 10 分鐘最多 5 次）。不保存原始 IP。
5. 管理後台顯示案件編號；修正案件狀態更新後的畫面同步與錯誤提示。
6. 房仲違規累計優先依 Facebook 個人檔案連結比對；沒有連結時才依正規化名稱比對。採取處分前仍應由管理員確認帳號身分。
7. 修正外部連結顯示與快速複製的安全性／相容性處理。


v0.2.2 圖示更新
- 首頁左上角原本的「太平」文字方塊，改用管理員提供的「太平人大小事」社團封面照片裁切圖。
- 新增網站分頁圖示（favicon），首頁與管理員後台分頁皆使用社團照片。
- 管理員後台內的「管理」標記維持原樣，以便辨識後台頁面。
- 本版僅調整品牌圖示與版本標示，不變更資料庫結構或既有功能。

【本機展示模式】
1. 不修改 config.js，直接部署即可預覽介面。
2. 展示模式的資料存在該瀏覽器 localStorage；不同電腦或瀏覽器不會同步。
3. 請勿把展示模式當成正式案件資料庫。

【第一次設定 Supabase】
1. 建立／使用一個 Supabase Project。
2. 開啟 SQL Editor，執行本資料夾的 setup_supabase.sql 全部內容。
3. 到 Authentication -> Users 建立管理員 Email / Password 使用者。
4. 複製該使用者 UUID，替換 SQL 最後註解中的 YOUR_USER_UUID，單獨執行：
   insert into public.admin_users(user_id) values ('你的使用者UUID');
5. 到 Project Settings / API（或新版介面的 API Keys）取得 Project URL 與 anon / publishable public key。
6. 編輯 config.js，將 YOUR_SUPABASE_URL 與 YOUR_SUPABASE_ANON_KEY 替換成自己的值。
7. 將整個資料夾部署到 Netlify。部署後先測試管理員登入、檢舉送出、申訴送出、後台案件讀取及狀態更新。

【升級注意：依你目前部署的版本選擇】
- 如果目前已經是 v0.2.1：本版 v0.2.2 只有圖示／版本標示更新，不需要執行 SQL；保留原本 config.js 的 Supabase 設定，備份後部署本版整個資料夾即可。
- 如果目前仍是 v0.2：本 ZIP 也包含 v0.2.1 的正式化修正。請先備份原本 config.js 中的 SUPABASE_URL 與 SUPABASE_ANON_KEY，再依本版「第一次設定 Supabase」或 v0.2.1 升級步驟，將資料庫結構更新一次；不要另建 Project，也不要刪除原本資料表。
- 若不確定目前版本，先不要執行 SQL，請先確認目前網站版本及資料庫狀態。

【安全注意】
- 只能把 Supabase anon / publishable public key 放進 config.js。
- 絕對不要把 service_role / secret key 放在網站前端。
- 管理員資料權限由 Supabase Auth、admin_users 與 RLS 控制，不是只靠隱藏 admin.html。
- 公開表單會使用資料庫 RPC 驗證欄位，並在可取得來源 IP 的環境中，以 SHA-256 雜湊值進行短時間限速。蜜罐與前端限速屬於基本防護；若網站公開後遭大量惡意提交，仍建議再加 CAPTCHA／Turnstile 與更完整的伺服器端防護。
- submission_rate_limits 只存雜湊後的 IP，不存原始 IP。可依需要定期清理 30 天未活動紀錄，SQL 範例已放在 setup_supabase.sql 最後。
- 請依實際需要制定個資告知與資料保存期限；檢舉／申訴內容可能含有個人資料，僅限授權管理員處理。

【已知限制】
- 本版尚未提供社員以案件編號查詢處理進度的頁面。
- 本版尚未提供證據圖片上傳、CSV 匯出、完整管理員操作歷程。
- 房仲身分比對仍以管理員填寫的 Facebook 個人檔案連結為主；網址不完整或同一人使用不同網址時，可能需要人工合併確認。
- 本版尚未連接 Facebook 社團管理 API，不會自動讀取貼文或執行禁言、移除、封鎖。

建議下一版 v0.3
- 案件備註與處理歷程
- 證據截圖上傳（Supabase Storage）
- 黑名單／重複違規快速搜尋
- CSV 匯出與備份
- 管理員操作紀錄
- 申訴案件編號查詢頁
