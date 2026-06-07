(function(app) {
  'use strict';

  var NUM_BUCKETS = 100;

  function hashCode(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  var Api = function() {
    this._termsLoaded = {};
  };

  Api.prototype.weeksLoaded = function() {
    if (!this._weeksLoaded) {
      this._weeksLoaded = $.getJSON('/data/weeks.json');
    }

    return this._weeksLoaded;
  };

  Api.prototype.termLoaded = function(term, exactMatch) {
    var key = JSON.stringify({ term: term, exactMatch: exactMatch });
    var lookupTerm = term.toLowerCase().replace(/\s+/g, ' ');

    if (!_.has(this._termsLoaded, key)) {
      var bucket = hashCode(lookupTerm) % NUM_BUCKETS;
      this._termsLoaded[key] = $.getJSON('/data/wordfreq/' + bucket + '.json')
        .then(function(data) {
          return data[lookupTerm] || { data: [], tokens: lookupTerm };
        });
    }

    return this._termsLoaded[key];
  };

  Api.prototype.whenWeeksAndTermLoaded = function(term, exactMatch) {
    var dfd = new $.Deferred();

    $.when(this.weeksLoaded(), this.termLoaded(term, exactMatch))
      .then(function(weeks, term) {
        dfd.resolve(term);
      });

    return dfd.promise();
  };

  Api.prototype.whenWeeksAndTermsLoaded = function(termsInfo) {
    var dfd = new $.Deferred();

    var promises = [ this.weeksLoaded() ];

    _.each(termsInfo, function(termInfo) {
      promises.push(this.termLoaded(termInfo.term, termInfo.exactMatch));
    }, this);

    $.when.apply($, promises).done(function() {
      var args = _.rest(arguments);
      var data = args;

      dfd.resolve(data);
    });

    return dfd.promise();
  };

  window.Api = Api;

}(app));
