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

// Clamp a number between 2 values.
// @param val Number to clamp.
// @param min Minimum allowed value.
// @param max Maximum allowed value.
// @returns Clamped value.
function Clamp(val, min, max)
{
  return Math.min(Math.max(val, min), max);
}
