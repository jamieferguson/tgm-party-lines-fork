var express = require("express");
var path = require("path");

var app = express();

app.use(express.static(path.join(__dirname, "app")));

app.get("*", function(req, res) {
  res.sendFile(path.join(__dirname, "app", "index.html"));
});

var port = process.env.PORT || 3000;
app.listen(port, function() {
  console.log("Server listening on " + port);
});
