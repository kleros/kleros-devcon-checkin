/**
 * Kleros Devcon booth: lead database on Google Sheets.
 *
 * Setup (see README.md for the full walkthrough):
 *   1. Create a Google Sheet, then Extensions > Apps Script.
 *   2. Paste the output of scripts/apps-script-bundle.sh (site/matching.js + this file) into the editor.
 *   3. Run `setup` once (authorise when asked). It builds every tab below
 *      and prints the dashboard / agent key in the execution log.
 *   4. Deploy > New deployment > Web app: Execute as "Me", Access "Anyone".
 *   5. Put the /exec URL in config.js.
 *
 * Tabs built by setup():
 *   Read me          what everything means
 *   Leads            master table, one row per person (the only tab anyone writes to)
 *   Priority queue   everyone, best leads first
 *   By pipeline      one block per Kleros track (focus pipelines first), then Other
 *   By level         Decision-maker / Influencer / Practitioner / Community
 *   Flags            leads where research found something worth acting on
 *   Research queue   leads still waiting for background research
 *   Dashboard        counts by pipeline x level, priority, research progress
 *   Agent log        every write made by a research agent
 *
 * HTTP API (all reads/writes except check-in need ?key= / "key"):
 *   POST {check-in payload}                        booth form check-in (no key)
 *   GET  ?key=K                                    all leads (dashboard)
 *   GET  ?key=K&action=merch&id=ID&value=true      mark merch given (id = Client ID; ticket=T also works)
 *   GET  ?key=K&action=queue[&limit=N]             leads with Research status = Pending
 *   POST {action:'enrich', key, ticket, agent, fields:{...}}   research agent write-back
 *   POST {action:'verify', id}                     has this visitor confirmed their Kleros blog subscription? (page polls)
 */

// Drive folder the database lives in ("Kleros Booth Check-in · Devcon 2026" in the work Drive).
// As a standalone project, the first run creates the Sheet there and remembers its id;
// as a bound script it uses the Sheet it's attached to.
var FOLDER_ID = '148P7gwxk7GcChF9d978jq1NwKlNk8rRe';

var LEADS = 'Leads';
// Devcon's local time, so check-in times read right at the booth. Change with the Devcon city.
var TIME_ZONE = 'Asia/Kolkata';
// Pre-formatted rows in Leads. Devcon can bring up to ~10,000 check-ins; check-ins add more rows if this fills up.
var CAPACITY = 10000;
var LOG = 'Agent log';

// Column groups. Order here is the column order in the sheet.
var GROUPS = [
  { name: 'Who they are', color: '#4d00b4', cols: [
    'Ticket', 'Checked in at', 'Name', 'Company', 'Role', 'Seniority',
    'Email', 'Telegram', 'LinkedIn', 'X'] },
  { name: 'What they told us', color: '#6b2fa8', cols: [
    'Interests', 'Other interest', 'Kleros use case idea', 'Working on', 'Wants call', 'Newsletter'] },
  { name: 'Kleros fit (automatic)', color: '#9013fe', cols: [
    'Pipeline', 'Primary use case', 'Secondary use case', 'Level', 'Fit score', 'Priority',
    'Suggested product', 'Owner', 'Next step', 'Match reasons'] },
  { name: 'Background research (agents)', color: '#0b6b5c', cols: [
    'Research status', 'Researched at', 'Researched by', 'Confidence',
    'Verified title', 'Company summary', 'Company stage', 'Funding & backers', 'Ecosystems',
    'Relevance to Kleros', 'Flag type', 'Flags', 'Sources'] },
  { name: 'Team follow-up', color: '#7a5200', cols: [
    'Status', 'Assigned to', 'Last contact', 'Team notes', 'Merch given', 'Returning visitor'] },
  { name: 'System', color: '#55565a', cols: [
    'Priority rank', 'Level rank', 'Source', 'Event', 'Client ID'] }
];

var HEADERS = [];
GROUPS.forEach(function (g) { HEADERS = HEADERS.concat(g.cols); });

// Only these columns may be written by research agents.
var RESEARCH_COLS = GROUPS[3].cols;

var LISTS = {
  'Research status': ['Pending', 'In progress', 'Done', 'Needs human', 'Skip'],
  'Confidence': ['High', 'Medium', 'Low'],
  'Flag type': ['Partnership', 'Integration', 'Enterprise deal', 'Investor', 'Speaker / content', 'AI juror operator',
                'Hiring / talent', 'Media', 'Competitor', 'Risk', 'None'],
  'Status': ['New', 'Contacted', 'Call booked', 'In discussion', 'Integrating', 'Not a fit'],
  'Company stage': ['Idea / pre-seed', 'Seed', 'Series A+', 'Public / large enterprise', 'DAO / protocol',
                    'Government / institution', 'University / research', 'Independent', 'Unknown']
};

function col_(name) { return HEADERS.indexOf(name) + 1; }

function letter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

var ss__ = null;
function ss_() {
  if (ss__) return ss__;
  ss__ = SpreadsheetApp.getActiveSpreadsheet();
  if (ss__) return ss__;
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  if (id) return (ss__ = SpreadsheetApp.openById(id));
  ss__ = SpreadsheetApp.create(SHEET_NAME);
  DriveApp.getFileById(ss__.getId()).moveTo(DriveApp.getFolderById(FOLDER_ID));
  props.setProperty('SHEET_ID', ss__.getId());
  return ss__;
}
function sheet_(name) { return ss_().getSheetByName(name) || ss_().insertSheet(name); }

/* ---------------------------------------------------------------- setup */

function setup() {
  buildLeads_();
  setTimeZone();
  buildViews_();
  buildDashboard_();
  buildLog_();
  buildReadme_();
  tidyDrive_();
  // Drop the default empty tab and put the tabs in reading order.
  var order = ['Read me', LEADS, 'Priority queue', 'By pipeline', 'By level', 'Flags', 'Research queue', 'Dashboard', LOG];
  ss_().getSheets().forEach(function (sh) { if (order.indexOf(sh.getName()) < 0 && ss_().getSheets().length > 1) ss_().deleteSheet(sh); });
  order.forEach(function (name, i) { ss_().setActiveSheet(sheet_(name)); ss_().moveActiveSheet(i + 1); });
  ss_().setActiveSheet(sheet_(LEADS));
  // Standalone projects don't get onOpen for free; install it once so the Kleros menu shows in the Sheet.
  var hasOpen = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'onOpen'; });
  if (!hasOpen) ScriptApp.newTrigger('onOpen').forSpreadsheet(ss_()).onOpen().create();
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_KEY')) props.setProperty('ADMIN_KEY', Utilities.getUuid().slice(0, 13));
  Logger.log('Dashboard / agent key: ' + props.getProperty('ADMIN_KEY'));
}

// Name the Sheet and keep this backend project in the same Drive folder as the Sheet.
var SHEET_NAME = 'Kleros Devcon 2026 \u00b7 Booth Leads Database';
function tidyDrive_() {
  ss_().rename(SHEET_NAME);
  var folder = DriveApp.getFileById(ss_().getId()).getParents();
  if (!folder.hasNext()) return;
  var f = folder.next();
  var script = DriveApp.getFileById(ScriptApp.getScriptId());
  var inFolder = false, ps = script.getParents();
  while (ps.hasNext()) if (ps.next().getId() === f.getId()) inFolder = true;
  if (!inFolder) script.moveTo(f);
}

function buildLeads_() {
  var sh = sheet_(LEADS);
  // New tabs only have 26 columns and 1,000 rows; size the table for every header and CAPACITY leads.
  if (sh.getMaxColumns() < HEADERS.length) sh.insertColumnsAfter(sh.getMaxColumns(), HEADERS.length - sh.getMaxColumns());
  if (sh.getMaxRows() < CAPACITY + 2) sh.insertRowsAfter(sh.getMaxRows(), CAPACITY + 2 - sh.getMaxRows());
  // Row 1: group bands. Row 2: headers. Data from row 3.
  var c = 1;
  GROUPS.forEach(function (g) {
    // Coloured band without merging, so the first columns can stay frozen.
    var r = sh.getRange(1, c, 1, g.cols.length);
    r.breakApart().setBackground(g.color).setFontColor('#ffffff').setFontWeight('bold');
    sh.getRange(1, c).setValue(g.name);
    sh.getRange(2, c, 1, g.cols.length).setValues([g.cols]).setBackground(g.color).setFontColor('#ffffff').setFontWeight('bold');
    c += g.cols.length;
  });
  sh.setFrozenRows(2);
  sh.setFrozenColumns(3);
  sh.getRange(2, 1, 1, HEADERS.length).setWrap(true).setVerticalAlignment('middle');

  var n = sh.getMaxRows() - 2;
  Object.keys(LISTS).forEach(function (h) {
    sh.getRange(3, col_(h), n, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(LISTS[h], true).setAllowInvalid(true).build());
  });
  sh.getRange(3, col_('Merch given'), n, 1).insertCheckboxes();

  var rng = function (h) { return sh.getRange(3, col_(h), n, 1); };
  var rule = function (h, text, bg, fg) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(text).setBackground(bg).setFontColor(fg).setRanges([rng(h)]).build();
  };
  sh.setConditionalFormatRules([
    rule('Priority', 'Hot', '#ffd6e0', '#9b0034'),
    rule('Priority', 'Warm', '#fff1cc', '#7a5200'),
    rule('Priority', 'Nurture', '#e6f7f4', '#0b6b5c'),
    rule('Level', 'Decision-maker', '#efe3ff', '#4d00b4'),
    rule('Wants call', 'Yes', '#ffd6e0', '#9b0034'),
    rule('Research status', 'Pending', '#f1f1f4', '#55565a'),
    rule('Research status', 'Needs human', '#fff1cc', '#7a5200'),
    SpreadsheetApp.newConditionalFormatRule().whenCellNotEmpty().setBackground('#fff1cc').setFontColor('#7a5200').setRanges([rng('Flags')]).build()
  ]);

  var widths = { 'Name': 160, 'Company': 160, 'Next step': 280, 'Match reasons': 220, 'Company summary': 260,
                 'Relevance to Kleros': 260, 'Flags': 240, 'Sources': 220, 'Team notes': 220, 'Kleros use case idea': 220 };
  HEADERS.forEach(function (h, i) { sh.setColumnWidth(i + 1, widths[h] || 120); });
  // System columns are for formulas and code; keep them out of the way.
  sh.hideColumns(col_('Priority rank'), GROUPS[5].cols.length);
}

// Columns every view shows, in this order.
var VIEW_COLS = ['Ticket', 'Name', 'Company', 'Role', 'Seniority', 'Level', 'Pipeline', 'Primary use case',
                 'Priority', 'Fit score', 'Wants call', 'Next step', 'Owner', 'Flag type', 'Flags',
                 'Research status', 'Status', 'Email', 'Telegram', 'LinkedIn'];

function viewSelect_() {
  return VIEW_COLS.map(function (h) { return letter_(col_(h)); }).join(', ');
}

function leadsRange_() {
  return "'" + LEADS + "'!A3:" + letter_(HEADERS.length);
}

function query_(where, order, limit) {
  return '=IFERROR(QUERY(' + leadsRange_() + ', "select ' + viewSelect_() + ' where ' + where +
    (order ? ' order by ' + order : '') + (limit ? ' limit ' + limit : '') + '", 0), "Nothing here yet")';
}

// Per-section cap on the stacked views (By pipeline, By level). Priority queue and Leads hold everyone.
var SECTION_LIMIT = 100;
function countNote_(col, value, label) {
  return '="' + label + ' · " & COUNTIF(' + "'" + LEADS + "'!" + L_(col) + '3:' + L_(col) + ',"' + value + '") & " leads (best ' + SECTION_LIMIT + ' shown; filter Priority queue for all)"';
}

function header_(sh, row, title, note) {
  sh.getRange(row, 1).setValue(title).setFontWeight('bold').setFontSize(12).setFontColor('#4d00b4');
  if (note) sh.getRange(row, 2).setValue(note).setFontColor('#55565a');
  sh.getRange(row + 1, 1, 1, VIEW_COLS.length).setValues([VIEW_COLS]).setFontWeight('bold').setBackground('#efe3ff');
}

function L_(h) { return letter_(col_(h)); }

// Every Kleros track from Matching.gs, focus pipelines first, then the catch-all.
function pipelines_() { return KLEROS_USE_CASES.map(function (u) { return u.short; }).concat(['Other']); }
var BEST_FIRST = '';

function buildViews_() {
  BEST_FIRST = L_('Priority rank') + ' asc, ' + L_('Level rank') + ' asc, ' + L_('Fit score') + ' desc';
  var notEmpty = L_('Ticket') + " is not null";

  var pq = sheet_('Priority queue'); pq.clear();
  header_(pq, 1, 'Priority queue', 'Hot first, then decision-makers, then fit score. Read-only: edit in Leads.');
  pq.getRange(3, 1).setFormula(query_(notEmpty, BEST_FIRST));
  pq.setFrozenRows(2);

  // Fixed-size blocks: each section shows its best SECTION_LIMIT leads, so sections never overlap.
  var BLOCK = SECTION_LIMIT;
  var bp = sheet_('By pipeline'); bp.clear();
  pipelines_().forEach(function (p, i) {
    var r = 1 + i * (BLOCK + 3);
    var uc = KLEROS_USE_CASES.filter(function (u) { return u.short === p; })[0];
    header_(bp, r, p, '');
    bp.getRange(r, 2).setFormula(countNote_('Pipeline', p, uc ? (uc.focus ? 'Focus pipeline · ' : '') + uc.product : 'No clear signal yet'));
    bp.getRange(r + 2, 1).setFormula(query_(L_('Pipeline') + " = '" + p + "'", BEST_FIRST, SECTION_LIMIT));
  });

  var bl = sheet_('By level'); bl.clear();
  ['Decision-maker', 'Influencer', 'Practitioner', 'Community'].forEach(function (lv, i) {
    var r = 1 + i * (BLOCK + 3);
    header_(bl, r, lv, '');
    bl.getRange(r, 2).setFormula(countNote_('Level', lv, { 'Decision-maker': 'Founders, C-suite, VPs and heads', 'Influencer': 'Managers, senior BD/product',
      'Practitioner': 'Individual contributors', 'Community': 'Students and community' }[lv]));
    bl.getRange(r + 2, 1).setFormula(query_(L_('Level') + " = '" + lv + "'", BEST_FIRST, SECTION_LIMIT));
  });

  var fl = sheet_('Flags'); fl.clear();
  header_(fl, 1, 'Flags', 'Research found something worth acting on.');
  fl.getRange(3, 1).setFormula(query_(L_('Flags') + " is not null", BEST_FIRST));

  var rq = sheet_('Research queue'); rq.clear();
  header_(rq, 1, 'Research queue', 'Waiting for background research. Agents work top to bottom.');
  rq.getRange(3, 1).setFormula(query_(L_('Research status') + " = 'Pending' or " + L_('Research status') + " = 'In progress'", BEST_FIRST));
}

function buildDashboard_() {
  var sh = sheet_('Dashboard'); sh.clear();
  var lr = "'" + LEADS + "'!";
  var colRef = function (h) { return lr + L_(h) + '3:' + L_(h); };
  sh.getRange('A1').setValue('Kleros at Devcon VIII · lead dashboard').setFontWeight('bold').setFontSize(14).setFontColor('#4d00b4');

  var kpis = [
    ['Check-ins', '=COUNTA(' + colRef('Ticket') + ')'],
    ['Hot', '=COUNTIF(' + colRef('Priority') + ',"Hot")'],
    ['Decision-makers', '=COUNTIF(' + colRef('Level') + ',"Decision-maker")'],
    ['Want a call', '=COUNTIF(' + colRef('Wants call') + ',"Yes")'],
    ['Flagged by research', '=COUNTIF(' + colRef('Flags') + ',"<>")'],
    ['Research pending', '=COUNTIF(' + colRef('Research status') + ',"Pending")'],
    ['Merch given', '=COUNTIF(' + colRef('Merch given') + ',TRUE)']
  ];
  sh.getRange(3, 1, kpis.length, 2).setValues(kpis);
  sh.getRange(3, 1, kpis.length, 1).setFontWeight('bold');

  var pipes = pipelines_();
  var levels = ['Decision-maker', 'Influencer', 'Practitioner', 'Community'];
  var top = 3 + kpis.length + 2;
  sh.getRange(top, 1).setValue('Pipeline × level').setFontWeight('bold').setFontColor('#4d00b4');
  sh.getRange(top + 1, 1, 1, levels.length + 3).setValues([['Pipeline'].concat(levels).concat(['Total', 'Hot'])])
    .setFontWeight('bold').setBackground('#efe3ff');
  pipes.forEach(function (p, i) {
    var row = [p];
    levels.forEach(function (lv) {
      row.push('=COUNTIFS(' + colRef('Pipeline') + ',"' + p + '",' + colRef('Level') + ',"' + lv + '")');
    });
    row.push('=COUNTIF(' + colRef('Pipeline') + ',"' + p + '")');
    row.push('=COUNTIFS(' + colRef('Pipeline') + ',"' + p + '",' + colRef('Priority') + ',"Hot")');
    sh.getRange(top + 2 + i, 1, 1, row.length).setValues([row]);
  });
  sh.setColumnWidth(1, 180);
}

function buildLog_() {
  var sh = sheet_(LOG);
  sh.getRange(1, 1, 1, 6).setValues([['Time', 'Agent', 'Ticket', 'Action', 'Fields written', 'Notes']])
    .setFontWeight('bold').setBackground('#0b6b5c').setFontColor('#ffffff');
  sh.setFrozenRows(1);
}

function buildReadme_() {
  var sh = sheet_('Read me'); sh.clear();
  var rows = [
    ['Kleros at Devcon VIII · lead database'],
    [''],
    ['How data gets here'],
    ['1. A visitor scans the booth QR and checks in. The page posts to this Sheet (Apps Script web app).'],
    ['2. A new row lands in Leads. Kleros fit is filled in automatically from matching (Matching.gs).'],
    ['3. Research status starts as Pending. Research agents pick rows from Research queue, look the person and company up, and write the Background research columns.'],
    ['4. The team works from Priority queue / By pipeline / Flags and updates Team follow-up.'],
    [''],
    ['Priority'],
    ['Hot: in a focus pipeline (AI agents, Prediction markets, Enterprise, DeFi curation) and asked for a call, or clear topic fit plus decision power.'],
    ['Warm: topic fit, or a senior person. Nurture: community, students, newsletter only.'],
    [''],
    ['Level (from Seniority + Role)'],
    ['Decision-maker: founders, C-suite, VP/Head/Director. Influencer: managers, senior BD/product. Practitioner: individual contributors. Community: students.'],
    [''],
    ['Rules'],
    ['Edit only the Leads tab. Every other tab is a formula view and refreshes by itself.'],
    ['Agents write only the Background research columns, and log every write in Agent log.'],
    ['Research uses public professional information only (company sites, LinkedIn headline, press, GitHub, X). No personal life, no sensitive data.'],
    ['Delete the whole row if someone asks to be removed.'],
    [''],
    ['Kleros menu: Re-run matching after editing Matching.gs · Rebuild views if a tab was deleted · Show key.']
  ];
  sh.getRange(1, 1, rows.length, 1).setValues(rows).setWrap(true);
  sh.setColumnWidth(1, 900);
  [1, 3, 9, 13, 16].forEach(function (r) { sh.getRange(r, 1).setFontWeight('bold').setFontColor('#4d00b4'); });
  sh.getRange(1, 1).setFontSize(14);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Kleros')
    .addItem('Re-run use-case matching', 'rematchAll')
    .addItem('Rebuild views & dashboard', 'rebuildViews')
    .addItem('Show dashboard / agent key', 'showKey')
    .addSeparator()
    .addItem('Load example rows', 'loadExamples')
    .addItem('Delete example & test rows', 'deleteExamples')
    .addToUi();
}

function rebuildViews() { buildViews_(); buildDashboard_(); }

// Sheet clock in Devcon's local time, and check-in times shown with the hour.
function setTimeZone() {
  ss_().setSpreadsheetTimeZone(TIME_ZONE);
  var sh = sheet_(LEADS);
  sh.getRange(3, col_('Checked in at'), sh.getMaxRows() - 2, 1).setNumberFormat('d mmm yyyy, hh:mm');
}

function showKey() {
  SpreadsheetApp.getUi().alert('Dashboard / agent key: ' + PropertiesService.getScriptProperties().getProperty('ADMIN_KEY'));
}

/* ------------------------------------------------------------------ API */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function authorised_(key) {
  return key && key === PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
}

// Guard clauses: require_(condition, error) stops the request, and respond_ answers { ok: false, error }.
function RequireError_(message) { this.message = message; }
function require_(condition, error) {
  if (!condition) throw new RequireError_(error);
}

// Runs a request handler. A failed require_ comes back as its error; anything unexpected (a lock timeout,
// a Sheets hiccup) as its details, so the page keeps the check-in queued and retries.
function respond_(handler) {
  try { return handler(); }
  catch (err) { return json_({ ok: false, error: err instanceof RequireError_ ? err.message : String(err) }); }
}

// Last row holding a lead. Based on the Ticket column, because the Merch checkboxes
// make Google treat every pre-formatted row as "used".
function lastRow_(sh) {
  var n = sh.getLastRow();
  if (n < 3) return 2;
  var vals = sh.getRange(3, col_('Ticket'), n - 2, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) if (vals[i][0] !== '' && vals[i][0] !== null) return i + 3;
  return 2;
}

function findRow_(sh, header, value) {
  var last = lastRow_(sh);
  if (last < 3) return -1;
  var vals = sh.getRange(3, col_(header), last - 2, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === String(value)) return i + 3;
  return -1;
}

function fitColumns_(m) {
  return [m.pipeline, m.primary, m.secondary, m.level, m.fitScore, m.priority, m.product, m.owner, m.nextStep, m.reasons];
}

function doPost(e) {
  return respond_(function () {
    var d = body_(e);
    // Polled every few seconds by visitors confirming their email; it only reads (plus one cell), so no write lock.
    if (d.action === 'verify') return verify_(d);
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);   // a busy timeout throws: respond_ answers with it and the page retries
    try {
      return d.action === 'enrich' ? enrich_(d) : checkIn_(d);
    } finally {
      lock.releaseLock();
    }
  });
}

function body_(e) {
  var d = null;
  try { d = JSON.parse(e.postData.contents); } catch (err) { /* reported just below */ }
  require_(d && typeof d === 'object', 'bad request');
  return d;
}

// Visitor text as a plain cell: capped in length, and never read as a formula ("=IMPORTXML(...)" stays text).
function text_(v) {
  v = String(v == null ? '' : v).slice(0, 1000);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

/** Booth check-in. Idempotent on client id. */
function checkIn_(d) {
  // Reject anything that isn't a real form submission (the form always sends these).
  require_(d.id && d.ticket && d.name && d.company, 'invalid check-in');
  var sh = sheet_(LEADS);
  if (findRow_(sh, 'Client ID', d.id) > 0) return json_({ ok: true, duplicate: true });
  var returning = !!d.email && findRow_(sh, 'Email', d.email) > 0;

  var m = matchLead({ company: d.company, position: d.position, seniority: d.seniority, interests: d.interests || [],
    building: d.building, otherInterest: d.otherInterest, klerosUse: d.klerosUse, wantsCall: d.wantsCall });

  var v = {};
  var ts = d.ts ? new Date(d.ts) : new Date();
  v['Ticket'] = text_(d.ticket); v['Checked in at'] = isNaN(ts) ? new Date() : ts;
  v['Name'] = text_(d.name); v['Company'] = text_(d.company); v['Role'] = text_(d.position); v['Seniority'] = text_(d.seniority);
  v['Email'] = text_(d.email); v['Telegram'] = d.telegram ? text_('@' + d.telegram) : ''; v['LinkedIn'] = text_(d.linkedin); v['X'] = d.x ? text_('@' + d.x) : '';
  v['Interests'] = text_((d.interests || []).join(', ')); v['Other interest'] = text_(d.otherInterest);
  v['Kleros use case idea'] = text_(d.klerosUse); v['Working on'] = text_(d.building);
  v['Wants call'] = d.wantsCall ? 'Yes' : 'No'; v['Newsletter'] = d.newsletter ? 'Yes' : 'No';
  var fit = fitColumns_(m);
  GROUPS[2].cols.forEach(function (h, i) { v[h] = fit[i]; });
  v['Research status'] = 'Pending';
  v['Status'] = 'New'; v['Merch given'] = false; v['Returning visitor'] = returning ? 'Yes' : '';
  v['Priority rank'] = m.priorityRank; v['Level rank'] = m.levelRank;
  v['Source'] = text_(d.source); v['Event'] = text_(d.event); v['Client ID'] = text_(d.id);

  var row = lastRow_(sh) + 1;
  if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 1000);
  sh.getRange(row, 1, 1, HEADERS.length).setValues([HEADERS.map(function (h) { return v.hasOwnProperty(h) ? v[h] : ''; })]);
  sh.getRange(row, col_('Merch given')).insertCheckboxes();
  return json_({ ok: true, ticket: d.ticket });
}

/** Research agent write-back: only Background research columns, always logged. */
function enrich_(d) {
  require_(authorised_(d.key), 'unauthorised');
  var sh = sheet_(LEADS);
  var row = findRow_(sh, 'Ticket', d.ticket);
  require_(row > 0, 'ticket not found');
  var fields = d.fields || {};
  var written = [];
  Object.keys(fields).forEach(function (h) {
    if (RESEARCH_COLS.indexOf(h) < 0) return;   // ignore anything outside the research group
    sh.getRange(row, col_(h)).setValue(typeof fields[h] === 'string' ? text_(fields[h]) : fields[h]);
    written.push(h);
  });
  if (!fields['Researched at']) { sh.getRange(row, col_('Researched at')).setValue(new Date()); written.push('Researched at'); }
  if (d.agent && !fields['Researched by']) { sh.getRange(row, col_('Researched by')).setValue(d.agent); written.push('Researched by'); }
  sheet_(LOG).appendRow([new Date(), d.agent || '', d.ticket, 'enrich', written.join(', '), d.note || '']);
  return json_({ ok: true, written: written });
}

function rowsAsObjects_(sh, filterFn, limit) {
  var last = lastRow_(sh);
  if (last < 3) return [];
  var values = sh.getRange(3, 1, last - 2, HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < values.length && (!limit || out.length < limit); i++) {
    var o = {};
    HEADERS.forEach(function (h, k) { var x = values[i][k]; o[h] = x instanceof Date ? x.toISOString() : x; });
    if (o['Ticket'] && (!filterFn || filterFn(o))) out.push(o);
  }
  return out;
}

function doGet(e) {
  return respond_(function () { return get_(e.parameter || {}); });
}

function get_(p) {
  require_(authorised_(p.key), 'unauthorised');
  var sh = sheet_(LEADS);

  if (p.action === 'merch' && (p.id || p.ticket)) {
    // By client id when the dashboard sends it, so a repeated ticket code can't mark the wrong person.
    var row = p.id ? findRow_(sh, 'Client ID', p.id) : -1;
    if (row < 0 && p.ticket) row = findRow_(sh, 'Ticket', p.ticket);
    require_(row > 0, 'ticket not found');
    var giving = p.value !== 'false';
    // Merch only once the visitor has confirmed their blog subscription. Checked live with Ghost, so it never
    // depends on what the visitor's page shows.
    if (giving && sh.getRange(row, col_('Newsletter')).getValue() !== 'Confirmed') {
      var c;
      try { c = blogConfirmed_(sh.getRange(row, col_('Email')).getValue()); } catch (err) { /* reported just below */ }
      require_(c !== undefined, 'Could not reach the Kleros blog to check the subscription. Try again in a moment.');
      require_(c !== null, 'The blog check is not set up yet (GHOST_ADMIN_KEY missing in Script properties).');
      require_(c, 'Email not confirmed yet. Ask them to tap "Confirm signup" in the Kleros blog email, then try again.');
      sh.getRange(row, col_('Newsletter')).setValue('Confirmed');
    }
    sh.getRange(row, col_('Merch given')).setValue(giving);
    return json_({ ok: true });
  }

  if (p.action === 'queue') {
    var queue = rowsAsObjects_(sh, function (o) { return o['Research status'] === 'Pending'; });
    queue.sort(function (a, b) { return (a['Priority rank'] - b['Priority rank']) || (a['Level rank'] - b['Level rank']) || (b['Fit score'] - a['Fit score']); });
    return json_({ ok: true, rows: queue.slice(0, Number(p.limit) || 25), researchColumns: RESEARCH_COLS, lists: LISTS });
  }

  return json_({ ok: true, rows: rowsAsObjects_(sh) });
}

/** Menu action: recompute matching for every row after tuning Matching.gs. */
function rematchAll() {
  var sh = sheet_(LEADS);
  var last = lastRow_(sh);
  if (last < 3) return;
  var data = sh.getRange(3, 1, last - 2, HEADERS.length).getValues();
  var g = function (r, h) { return r[col_(h) - 1]; };
  var fit = [], ranks = [];
  data.forEach(function (r) {
    var m = matchLead({ company: g(r, 'Company'), position: g(r, 'Role'), seniority: g(r, 'Seniority'),
      interests: String(g(r, 'Interests') || ''), building: g(r, 'Working on'), otherInterest: g(r, 'Other interest'),
      klerosUse: g(r, 'Kleros use case idea'), wantsCall: g(r, 'Wants call') });
    fit.push(fitColumns_(m));
    ranks.push([m.priorityRank, m.levelRank]);
  });
  sh.getRange(3, col_('Pipeline'), fit.length, fit[0].length).setValues(fit);
  sh.getRange(3, col_('Priority rank'), ranks.length, 2).setValues(ranks);
}

/* ------------------------------------------------------------ blog gate */

// The final check-in screen (and merch) only comes once the visitor has confirmed their Kleros blog
// subscription. Ghost creates the member only after they tap "Confirm signup", so "member exists" = confirmed.
// Needs a Ghost Admin API key in Script properties: GHOST_ADMIN_KEY ("id:secret") and GHOST_ADMIN_URL (the
// "API URL" shown next to the key). Strict on purpose: without a working key nobody gets through.
function ghostConfig_() {
  var p = PropertiesService.getScriptProperties();
  var key = String(p.getProperty('GHOST_ADMIN_KEY') || '').trim();
  if (!/^[0-9a-f]+:[0-9a-f]+$/i.test(key)) return null;
  return { id: key.split(':')[0], secret: key.split(':')[1],
           url: String(p.getProperty('GHOST_ADMIN_URL') || 'https://blog.kleros.io').trim().replace(/\/+$/, '') };
}

// Short-lived Admin API token (Ghost's documented JWT: HS256, kid = key id, aud = /admin/).
function ghostToken_(cfg) {
  var b64 = function (x) { return Utilities.base64EncodeWebSafe(x).replace(/=+$/, ''); };
  var now = Math.floor(Date.now() / 1000);
  var unsigned = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: cfg.id })) + '.' +
                 b64(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' }));
  var key = cfg.secret.match(/../g).map(function (h) { var n = parseInt(h, 16); return n > 127 ? n - 256 : n; });
  return unsigned + '.' + b64(Utilities.computeHmacSha256Signature(Utilities.newBlob(unsigned).getBytes(), key));
}

// true / false, or null when no key is set up. Throws if Ghost can't be reached.
function blogConfirmed_(email) {
  var cfg = ghostConfig_();
  if (!cfg) return null;
  email = String(email || '').trim().toLowerCase();
  if (!email) return false;
  var cache = CacheService.getScriptCache(), ck = 'ghost:' + email;
  var hit = cache.get(ck);
  if (hit) return hit === '1';
  var res = UrlFetchApp.fetch(cfg.url + '/ghost/api/admin/members/?limit=1&filter=' + encodeURIComponent("email:'" + email.replace(/'/g, "\\'") + "'"),
    { headers: { Authorization: 'Ghost ' + ghostToken_(cfg), 'Accept-Version': 'v5.0' }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Ghost ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  var ok = (JSON.parse(res.getContentText()).members || []).length > 0;
  cache.put(ck, ok ? '1' : '0', ok ? 21600 : 4);   // confirmed stays confirmed; "not yet" re-checked within seconds
  return ok;
}

/** Has this check-in's visitor confirmed their blog subscription? Uses the email saved with the check-in, never one sent with the request. */
function verify_(d) {
  if (!ghostConfig_()) return json_({ ok: true, confirmed: false, setup: false });   // no key yet: nobody passes
  var sh = sheet_(LEADS);
  var row = d.id ? findRow_(sh, 'Client ID', d.id) : -1;
  if (row < 0) return json_({ ok: true, confirmed: false, pending: true });   // check-in not saved yet
  var news = sh.getRange(row, col_('Newsletter'));
  if (news.getValue() === 'Confirmed') return json_({ ok: true, confirmed: true });
  var c = blogConfirmed_(sh.getRange(row, col_('Email')).getValue());
  if (c) news.setValue('Confirmed');
  return json_({ ok: true, confirmed: !!c });
}

/** Run from the editor after adding the key: says whether the gate is on and Ghost answers. */
function ghostStatus() {
  var cfg = ghostConfig_();
  if (!cfg) { Logger.log('NOT SET UP: no valid GHOST_ADMIN_KEY in Script properties, so no visitor can finish checking in. Add the key.'); return; }
  var res = UrlFetchApp.fetch(cfg.url + '/ghost/api/admin/members/?limit=1',
    { headers: { Authorization: 'Ghost ' + ghostToken_(cfg), 'Accept-Version': 'v5.0' }, muteHttpExceptions: true });
  Logger.log('Ghost at ' + cfg.url + ' answered ' + res.getResponseCode() + (res.getResponseCode() === 200 ? ' (key works)' : ': ' + res.getContentText().slice(0, 200)));
}

/* ------------------------------------------------------------- examples */

// Fictional people and companies (marked EX- and "(example)") so the team can see a filled-in database.
// They go through the same check-in and enrich paths as real data. Delete them before Devcon.
var EXAMPLES = [
  { c: ['Aria Menon', 'Agentra Labs (example)', 'Founder / C-level', 'Founder / C-suite', ['Disputes for AI Agents'], '', 'Arbitrating failed jobs between agents on our marketplace', 'Agent-to-agent services marketplace', true],
    r: { 'Research status': 'Done', 'Confidence': 'High', 'Verified title': 'Co-founder & CEO', 'Company summary': 'Agent marketplace where AI agents hire other agents for tasks.', 'Company stage': 'Seed', 'Ecosystems': 'Base, Ethereum', 'Relevance to Kleros': 'Needs a dispute route when an agent job fails; natural fit for the Dispute Service.', 'Flag type': 'Integration', 'Flags': 'Asked for a call and building agent payments with x402. Design-partner candidate.', 'Sources': 'example' } },
  { c: ['Lina Shah', 'PayNova (example)', 'Product Manager', 'Manager / Team lead', ['Enterprise & Customer Disputes'], '', 'Chargeback disputes for crypto card users', 'Crypto debit card', false],
    r: { 'Research status': 'Done', 'Confidence': 'High', 'Verified title': 'Senior PM, Disputes', 'Company summary': 'Neobank with a crypto card.', 'Company stage': 'Series A+', 'Ecosystems': 'Polygon', 'Relevance to Kleros': 'Owns the disputes product; matches the Kleros Enterprise chargeback case.', 'Flag type': 'Enterprise deal', 'Flags': 'Owns budget for disputes tooling.', 'Sources': 'example' } },
  { c: ['Omar Rizvi', 'ListGuard Wallet (example)', 'Engineer / Developer', 'Individual contributor', ['DeFi Curation & Token Lists'], 'Wallet security', 'Community-curated scam address list', 'Wallet scam warnings', false], r: null }
];

function loadExamples() {
  var key = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  EXAMPLES.forEach(function (x, i) {
    var t = 'EX-' + ('0' + (i + 1)).slice(-2);
    var c = x.c;
    checkIn_({ id: 'example-' + (i + 1), ticket: t, ts: new Date().toISOString(), name: 'Example: ' + c[0], company: c[1],
      position: c[2], seniority: c[3], interests: c[4], otherInterest: c[5], klerosUse: c[6], building: c[7], wantsCall: c[8],
      email: c[0].split(' ')[1].toLowerCase() + '@example.com', newsletter: true, source: 'example', event: 'Devcon VIII Mumbai' });
    if (x.r) enrich_({ key: key, ticket: t, agent: 'example-agent', fields: x.r, note: 'example row' });
  });
}

function deleteExamples() {
  var sh = sheet_(LEADS);
  var n = sh.getLastRow();
  if (n >= 3) {
    var vals = sh.getRange(3, 1, n - 2, HEADERS.length).getValues();
    var g = function (r, h) { return String(r[col_(h) - 1] || ''); };
    for (var i = vals.length - 1; i >= 0; i--) {
      var r = vals[i];
      var isExample = g(r, 'Ticket').indexOf('EX-') === 0;
      var isTest = g(r, 'Name').indexOf('Test:') === 0;
      // A row with matching output but no ticket is junk from a malformed request.
      var isJunk = !g(r, 'Ticket') && !!(g(r, 'Pipeline') || g(r, 'Client ID') || g(r, 'Name'));
      if (isExample || isTest || isJunk) sh.deleteRow(i + 3);
    }
  }
  var log = sheet_(LOG);
  for (var k = log.getLastRow(); k >= 2; k--) {
    if (String(log.getRange(k, 3).getValue()).indexOf('EX-') === 0) log.deleteRow(k);
  }
}
