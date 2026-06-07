var express = require("express");
var { Pool } = require("pg");
var path = require("path");

var pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_FQ1Orc8mTxSh@ep-raspy-frog-a7pto9bb-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require"
});

var app = express();

app.use(express.static(path.join(__dirname, "app")));
app.use(express.json());

app.get("/api/weeks", function(req, res) {
  pool.query("SELECT to_char(week_date, 'YYYY-MM-DD') AS w FROM weeks ORDER BY week_date").then(function(result) {
    res.json(result.rows.map(function(r) { return r.w; }));
  }).catch(function(err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  });
});

app.get("/api/wordchoices/term/:term", function(req, res) {
  var term = req.params.term;
  var exactMatch = req.query.c === "true";
  var tokens = term.toLowerCase().replace(/\s+/g, ' ');

  pool.query(
    "SELECT party, to_char(week_date, 'YYYY-MM-DD') AS week, frequency AS freq FROM word_frequencies WHERE term = $1 AND exact_match = $2 ORDER BY party, week_date",
    [term, exactMatch]
  ).then(function(result) {
    res.json({ data: result.rows, tokens: tokens });
  }).catch(function(err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  });
});

app.get("/api/hansards", function(req, res) {
  var ids = req.query.ids;
  if (!ids) return res.json([]);

  var idList = ids.split(",").filter(Boolean);

  pool.query(
    "SELECT id, person_id, first_name, last_name, party, to_char(date, 'YYYY-MM-DD') AS date, html FROM hansards WHERE id = ANY($1)",
    [idList]
  ).then(function(result) {
    res.json(result.rows);
  }).catch(function(err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  });
});

app.get("*", function(req, res) {
  res.sendFile(path.join(__dirname, "app", "index.html"));
});

var port = process.env.PORT || 3000;
app.listen(port, function() {
  console.log("Server listening on " + port);
});
