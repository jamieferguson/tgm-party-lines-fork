(function(app) {
  'use strict';

  var Snippets = window.Snippets = { maxSnippets: 50 };
  var _render = _.template(document.getElementById('snippets-template').innerHTML);

  var container      = $('#snippets');
  var outerContainer = $('#snippet-container');
  var furtherSearch  = $('#openau-further-search');
  var snippetsLink   = $('#snippet-link');

  snippetsLink.on('click', function(e){
    e.preventDefault();
    $.scrollTo('#snippet-container', 'slow', function(){
      snippetsLink.hide();
    });
  });

  Snippets.requestSnippets = function(){
    app.vent.trigger('snippetsRequested');
  };

  Snippets.loadSnippets = function() {
    var ids = _.uniq(app.hansardIds.join(',').split(','))
                .slice(0, Snippets.maxSnippets).join(',');
    if (!ids) {
      Snippets.showNoData();
      return;
    }

    var months = {};
    _.each(ids.split(','), function(id) {
      var m = id.match(/(\d{4}-\d{2})/);
      if (m) months[m[1]] = true;
    });

    container.html('<div id="loading"><p>Loading Hansard transcripts...</p></div>');
    furtherSearch.empty();

    var promises = _.map(Object.keys(months), function(month) {
      return $.getJSON('/data/hansards/' + month + '.json');
    });

    $.when.apply($, promises).done(function() {
      container.empty();
      var all = {};
      _.each(arguments, function(data) {
        _.extend(all, data);
      });
      var idList = ids.split(',');
      _.each(idList, function(id) {
        var h = all[id];
        if (!h) return;
        var $html = Snippets.render(h);
        $html.find('.quotes-container').append(Snippets.buildQuotes(h));
        container.append($html);
      });

      if (container.children().length === 0) {
        Snippets.showNoData();
        return;
      }

      if (container.children().length >= Snippets.maxSnippets) {
        furtherSearch.append(Snippets.buildOpenAuFurtherSearch());
      }

      app.vent.trigger('snippetsLoaded');
    }).fail(function() {
      Snippets.showNoData();
    });
  };

  Snippets.render = function(data) {
    var $html = $(_render(data));
    return $html;
  };

  Snippets.buildQuotes = function(hansard) {
    var html = '', speech = hansard.html;
    var partyData = _.detect(app.parties, function(party) {
      return party.name === hansard.party;
    });

    speech = speech.replace(/<a.*?>(.*?)<\/a>/gim, '$1');

    _.each(app.terms, function(term, index) {
      if (term) {
        var searchTerm = term;
        var tokens = app.data[index].tokens;

        if (tokens) {
          searchTerm = _.map(tokens.split(' '), function(token){
            return token;
          }).join(' ');
        }

        var regex = '(^|[^a-zA-Z])(' + searchTerm + '|' + searchTerm.replace(/ /, '-') + ')([^a-zA-Z]|$)';
        speech = speech.replace(
          RegExp(regex, 'gmi'),
          '$1 <span style="background-color: ' + (partyData ? partyData.colour : '#333333') + '" class="highlight ' + hansard.party.replace(' ', '-').toLowerCase() + ' ">$2</span> $3'
        );
      }
    });

    var highlightedParas = _.select(speech.split('</p>'), function(p) { return p.match(/class="highlight/m); });

    _.each(highlightedParas, function(p) {
      html += '<blockquote>' + p;
      html += '</p></blockquote>';
    });

    html += this.buildOpenAuLink(hansard);

    return html;
  };

  Snippets.buildOpenAuLink = function(hansard){
    var match = hansard.id.match(/([^-]*)-(.*)/);
    var house = match[1] === 'house' ? 'debates' : 'senate';
    var openauId = match[2];
    var html = '<div class="openau-link">';
    html += '<a class="button" target="_BLANK" href="http://www.openaustralia.org/' + house + '/?id=';
    html += openauId +  '" title="View full speech at OpenAustralia">View in full</a>';
    html += '<br />';
    html += '<span class="sub">@openaustralia.org</span>'
    html += '</div>';
    return html;
  };

  Snippets.buildOpenAuFurtherSearch = function() {
    var html = [
      '<div class="openau-further-search-text">',
        '<h3 class="more-results-text">There are more results ',
          '(we only show the first ' + Snippets.maxSnippets + ')',
        '</h3>',
        '<h3 class="more-search-text">',
          'Do more complete searches at OpenAustralia',
        '</h3>',
        '<ul class="further-search-terms container">'
    ];

      _.each(app.terms, function(term) {
        html.push('<li><a class="button" target="_BLANK" href="http://www.openaustralia.org/search/?s=%22');
        html.push(encodeURIComponent(term) + '%22">&quot;' + _.escape(term) + '&quot;</a></li>');
      });

    html.concat([
        '</ul>',
      '</div>'
    ]);

    return html.join('');
  }

  Snippets.showNoData = function() {
    container.html('<p class="no-data"><em>No matches found.</em> Please try a different week.</p>');
    Snippets.requestSnippets();
  };

  app.vent.on('snippetsRequested', function() {
    outerContainer.show();
    snippetsLink.slideDown();
  });

  app.vent.on('terms:loading', function() {
    outerContainer.hide();
    snippetsLink.hide();
  });

}(app));
