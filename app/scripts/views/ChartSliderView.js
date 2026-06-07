(function(app, Backbone) {
  'use strict';
  var touchState = false;
  var touchDelay = 120;

  var ChartSliderView = Backbone.View.extend({

    render: function(svg, options, charts) {
      renderSlider(svg, options, charts);
    }

  });

  function renderSlider(svg, options, charts) {
    var fullHeight = app.data.length * (options.height + options.margin.top) + (options.margin.topXAxisMargin - options.margin.top);
    var data = _.map(app.weeks, function() { return fullHeight; });

    var xScale = d3.scale.ordinal()
      .rangeBands([0, options.width])
      .domain(app.weeks);

    var yScale = d3.scale.linear()
      .range([fullHeight, 0])
      .domain([0, fullHeight]);

    var sliderContainer = svg.append("g")
      .attr('id','slider-container')
      .style('-webkit-user-select', 'none')
      .attr("transform", "translate(" + (options.margin.left+1) + "," + (options.margin.superTop - options.margin.topXAxisMargin) + ")")
      .attr('height', fullHeight);

    $(sliderContainer.node()).on('mouseleave', function() {
      if (!app.selectedSliderBlind) {
        app.vent.trigger('chart:unselected');
      }
      deselect();
    });

    sliderContainer.selectAll("rect")
      // XXX hack to make step after render properly :(
      .data(data.slice(0,-1))
      .enter().append("rect")
      .attr("x", function(d, i){ return xScale(app.weeks[i]); })
      .attr("y", 0)
      .attr('class','slider-blind')
      .attr("width", xScale.rangeBand())
      .attr('data-week', function(d, i){
        return app.weeks[i];
      })
      .attr("height", fullHeight)
      .on('mousemove', function(e) {
        if (touchState) {
          return false;
        }
        app.vent.trigger('chart:hover');
        explore(this, true);
      })
      .on('mousedown', function(e) {
        if (touchState) {
          return false;
        }
        select($(this));
      });

    var dateLegendContainer = options.textContainer
      .append('g')
      .attr('class', 'date-legend-container')
      .style('display', 'none');

    var dateLegendBackground = dateLegendContainer.append('rect');

    var dateLegendText = dateLegendContainer.append('text')
      .attr('class', 'legend-date')
      .attr('transform', 'translate(10, 16)')
      .style('fill', '#ccc')
      .style('font-weight', 'normal')
      .style('font-size', '10px');

    dateLegendContainer.append('text')
      .text('Select to view details')
      .attr('transform', 'translate(10, 29)')
      .attr('class', 'date-action-text')
      .style('fill', '#FFFFFF')
      .style('font-weight', 'bold')
      .style('font-style', 'italic')
      .style('font-size', '12px');

    var dateLegendArrow = dateLegendContainer.append('path')
      .attr('d', 'M0 5 L5 0 L5 10z')
      .attr('transform', 'translate(-5, 16)')
      .style({
        'fill': '#000000',
        'opacity': 0.7
      });

    svg.on('touchstart', function() {
      var e = d3.event;

      if (e.touches.length === 1) {
        var touch = e.touches[0];

        touchState = {
          touch: touch,
          startedAt: new Date().getTime(),
          type: 'start',
          holding: false
        };

        touchState.starterTimeout = setTimeout(function() {
          // start at is set false on touchend, so this only executes while they're still pressing
          if (touchState.type === 'start') {
            app.vent.trigger('chart:hover');
            touchState.holding = true;
            var target = touchState.target = document.elementFromPoint(touch.clientX, touch.clientY);

            if (!target || (target && !target.getAttribute('data-week'))) {
              return;
            }

            explore(touch.target, true, true, true);
          }
        }, touchDelay);
      }
    });

    svg.on('touchmove', function() {
      var currentTime = new Date().getTime();
      var e = d3.event;

      // more than one finger or still waiting to hold longer
      if (e.changedTouches.length !== 1 || !touchState.holding) {
        return true;
      }

      var touch = touchState.touch = e.changedTouches[0];

      var target = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!target || (target && !target.getAttribute('data-week'))) {
        return;
      }

      explore(target, true, true, true);
      touchState.target = target;
      touchState.type   = 'move';

      e.preventDefault();
      return false;
    });

    svg.on('touchend', function() {
      var target;
      var e = d3.event;

      touchState.type = 'end';

      if (!app.selectedSliderBlind) {
        app.vent.trigger('chart:unselected');
      }

      deselect();

      // more than one finger or still waiting to hold longer
      if (e.changedTouches.length !== 1 || !touchState.holding) {
        clearTimeout(touchState.starterTimeout);
        return true;
      }

      target = touchState.target;
      touchState.touch = e.changedTouches[0];

      explore(target, true, -1);
      select($(target));
    });

    function select(selection) {
      app.vent.trigger('chart:hover');
      var hansardIds = [];
      if (app.selectedSliderBlind){
        app.selectedSliderBlind.attr('class', 'slider-blind');
      }

      app.selectedSliderBlind = selection;
      app.selectedSliderBlind.attr('class', 'slider-blind selected');
      app.selectedWeek = app.selectedSliderBlind.data('week');

      _.each(app.data, function(termData, i) {
        var countData = {
          week: formatWeek(app.selectedWeek),
          counts: []
        };

        _.each(termData.data, function(datum){
          var party;
          if (datum.week === app.selectedWeek && datum.freq > 0) {
            party = findParty(datum.party);
            if (party) {
              hansardIds.push(datum.ids);
            }
          }
        });
      });

      if (hansardIds.length) {
        app.hansardIds = hansardIds;

        if (app.loadTimer) {
          clearTimeout(app.loadTimer);
        }

        Snippets.requestSnippets();
        app.loadTimer = setTimeout(Snippets.loadSnippets, 500);
      } else {
        Snippets.showNoData();
      }
    }

    function explore(exploredBlind, updateClass, touch, hidePartyData) {
      if (updateClass && app.activeSliderBlind && app.activeSliderBlind.attr('class')) {
        // maybe just do class.replace('active', '')?
        if (app.activeSliderBlind.attr('class').match(/selected/)) {
          app.activeSliderBlind.attr('class', 'slider-blind selected');
        } else {
          app.activeSliderBlind.attr('class', 'slider-blind');
        }
      }

      app.activeSliderBlind = $(exploredBlind);

      if (updateClass && !app.activeSliderBlind.attr('class').match(/selected/)) {
        app.activeSliderBlind.attr('class', 'slider-blind active');
      }

      app.activeWeek = app.activeSliderBlind.data('week');

      if (!hidePartyData) {
        _.each(app.data, function(termData, i) {
          var countData = {
            week: formatWeek(app.activeWeek),
            counts: []
          };

          _.each(termData.data, function(datum) {
            var party;
            if (datum.week === app.activeWeek && datum.freq > 0){
              party = findParty(datum.party);
              if (party) {
                countData.counts.push({party: party, count: datum.freq});
              }
            }
          });

          if (i in charts) {
            charts[i].updateLegend(countData);
          }
        });
      }

      var y = 0;
      var x = 0;
      var extraWidth = 0;

      if (touch) {
        if (touch === -1) { // touchend
          dateLegendContainer.style('display', 'none');
          return;
        }

        var touches = d3.touches(sliderContainer.node(), [touchState.touch]);

        if (touches.length) {
          y = touches[0][1];
        }

        dateLegendContainer.select('.date-action-text').text('Release to view details');
        x = parseInt(app.activeSliderBlind.attr('x'), 10) + 57
        extraWidth = 9;
      } else {
        y = d3.mouse(sliderContainer.node())[1];
        x = parseInt(app.activeSliderBlind.attr('x'), 10) + 41;
      }

      dateLegendContainer
        .attr('transform', 'translate(' + x + ', ' + y + ')')
        .style('display', 'inline');

      dateLegendText.text(formatWeek(app.activeWeek));

      var dateLegendSize = dateLegendText.node().getBBox();

      dateLegendBackground.attr({
        transform: 'translate(0, 0)',
        width: dateLegendSize.width + 74 + extraWidth,
        height: dateLegendSize.height + 10 + 14
      })
      .style('opacity', 0.7);
    }

    function deselect() {
      dateLegendContainer.style('display', 'none');

      if (app.activeSliderBlind) {
        app.activeSliderBlind.attr('class', function() {
          return d3.select(this).attr('class').replace('active', '');
        });
      }
    }
  }

  function formatWeek(activeWeek){
    var parse = activeWeek.split('-');
    return 'Week ' + parse[1] + ' ' + parse[0];
  }

  function findParty(party){
    return _.detect(app.parties, function(p){ return p.name === party });
  }

  app.Views.ChartSliderView = ChartSliderView;
}(app, Backbone));
