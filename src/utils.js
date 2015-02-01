// Iterates through the properties of an object.
// @param obj The object to iterate.
// @param callback The callback.
function ForEachProperty(obj, callback)
{
  for (var property in obj)
  {
    if (obj.hasOwnProperty(property))
      callback(property);
  }
}
