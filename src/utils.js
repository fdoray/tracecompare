// Iterates through the properties of an object.
// @param obj The object to iterate.
// @param callback The callback.
function ForEachProperty(obj, callback)
{
  for (var property in obj)
  {
    if (obj.hasOwnProperty(property))
      callback(property, obj[property]);
  }
}

// Convert nanoseconds to microseconds.
// @param nsec Duration in nanoseconds.
// @returns The duration in microseconds.
function NanoToMicro(nsec)
{
    return nsec / 1000;
}

// Elide a string so that is uses at most |numChar| characters.
// @param str The string to elide.
// @param numChar The maximum number of characters to keep.
// @returns The elided string.
function ElideString(str, numChar)
{
  if (str.length <= numChar)
    return str;

  if (numChar <= 1)
    return '';
  if (numChar == 2)
    return str.substr(0, 1) + '.';

  return str.substr(0, numChar) + '..';
}

