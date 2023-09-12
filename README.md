# Geolocation Elevation Analyzer

Gets the elevation data within a specified distance centred around each provided Lat/Lng coordinate. 30 arc-second (1km) elevation data from [NOAA](https://www.ngdc.noaa.gov/mgg/topo/globeget.html) is used (check Elevation Data instructions below for how to get the data).

Returns the following data for each coordinate:

```typescript
{
  "center": number,   // the elevation value at the center (lat/lng coords provided in input)
  "average": number,  // the average (mean) elevation within the target area
  "min": number,      // the lowest elevation found within the target area
  "max": number,      // the highest elevation found within the target area
  "variance": number, // the statistical variance for all the elevation values analyzed within the target area
}
```

## Elevation Data

The elevation data is not included and must be downloaded from [NOAA's website](https://www.ngdc.noaa.gov/mgg/topo/DATATILES/elev/all10g.zip).
1. Download the elevation data files
2. Extract the files ("a10g", "b10g" ... "p10g") into the `./data` directory (make sure the files are not in any folders, put them directly into the root of the data directory)

## Running The Script

[Deno](https://deno.com/) is required to run the script.

```console
  $ deno run -A main.ts <input_file_path.json> <apothem>
```
- `<input_file_path.json>`: file path to the input JSON file on your computer
- `<apothem>`: distance in metres in each direction from the coordinate to analyze (forms a square bounding box centred on the coordinate)

### Input JSON Format

```typescript
{
  "customCoordinates": [
    {
      "lat": number,
      "lng": number,
    },
    {...}
  ]
}
```

### Output JSON Format

Adds an `elevation` property to each successful location and saves the output to `output.json`. Locations that don't find any data will omit the `elevation` property.

```typescript
{
  "customCoordinates": [
    {
      "lat": number,
      "lng": number,
      "elevation": {
        "center": number,
        "average": number,
        "min": number,
        "max": number,
        "variance": number,
      }
    },
    {...}
  ]
}
```
