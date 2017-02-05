
// source: http://stackoverflow.com/questions/610406/javascript-equivalent-to-printf-string-format
exports.format = function format (str, ...args) {
  return str.replace(/{(\d+)}/g, function (match, number) {
    return typeof args[number] !== 'undefined'
      ? args[number]
      : match
    ;
  })
}
