var formatMicroseconds = d3.format('06d');

function Table(tbody, dimension)
{
  tbody.each(function() {
    var executionsSelect = tbody.selectAll(".execution-row")
        .data(dimension.top(20), function(execution) { return execution['b']; });
    var executionsEnter = executionsSelect.enter().append('tr')
      .attr('class', 'execution-row');

    executionsEnter.append('td')
      .text(function(execution) {
        // Timestamp.
        var timestamp = execution['b'];
        var date = new Date(timestamp / 1000);
        var microseconds = timestamp % 1000000;
        return date.toLocaleString() + '.' + formatMicroseconds(microseconds);
      });

    executionsEnter.append('td')
      .text(function(execution) {
        // Duration.
        var duration = execution['a'];
        return duration.toLocaleString() + ' μs';
      });

    executionsSelect.exit().remove();
    executionsSelect.order();
  });
}
