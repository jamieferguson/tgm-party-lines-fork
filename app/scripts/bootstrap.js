(function(window, _) {
  'use strict';

  var app = {
    url: "",

    parties: [
      { abbrev: 'DEM', name: 'Australian Democrats', colour: '#f3bf07' },
      { abbrev: 'GRN', name: 'Australian Greens', colour: '#33b26a' },
      { abbrev: 'ALP', name: 'Australian Labor Party', colour: '#e23c3f' },
      { abbrev: 'Country Lib', name: 'Country Liberal Party', colour: '#87b8da' },
      { abbrev: 'Democratic Lab', name: 'Democratic Labor Party', colour: '#f09d9f' },
      { abbrev: 'Family First', name: 'Family First Party', colour: '#ff835e' },
      { abbrev: 'IND', name: 'Independent', colour: '#aaa' },
      { abbrev: 'LIB', name: 'Liberal Party', colour: '#1072b6' },
      { abbrev: 'NAT', name: 'National Party', colour: '#bd744d' }
    ],

    presets: {
      'Framing Carbon':     ['Carbon Tax', 'Carbon Price', 'Price On Pollution'],
      'Defining Marriage':  ['Civil Union','Same Sex Marriage', 'Gay Marriage','Marriage Equality'],
      'Immigration':        ['Border Security', 'Boat People', 'Stop The Boats', 'Pacific Solution'],
      'Arrival Lines':      ['Refugee', 'Asylum Seeker', 'Boat People', 'Illegals'],
      'Remember When':      ['Petrol Prices', 'Breastfeeding', 'Binge Drinking', 'Live Exports']
    },

    data: [],
    activeSliderBlind: null,
    selectedSliderBlind: null,
    loadTimer: null,
    activeWeek: null,

    allowCustomSearches: true,

    vent: _.extend({}, Backbone.Events),
    reqres: new Backbone.Wreqr.RequestResponse(),
    commands: new Backbone.Wreqr.Commands(),

    $ui: {
      chart: $('#chart-container')
    },

    Views: {}
  };

  app.config = _.clone(app);

  window.app = app;
}(window, _));
