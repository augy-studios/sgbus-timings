import 'dart:math' as math;

/// Metres between two points, as the site's haversine.
double metresBetween(double lat1, double lng1, double lat2, double lng2) {
  double rad(double d) => d * math.pi / 180;
  final dLat = rad(lat2 - lat1);
  final dLng = rad(lng2 - lng1);
  final h = math.pow(math.sin(dLat / 2), 2) + math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.pow(math.sin(dLng / 2), 2);
  return 6371000 * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h));
}

double metresAB(List<double> a, List<double> b) => metresBetween(a[0], a[1], b[0], b[1]);

/// "350 m", "1.2 km".
String formatDistance(num? m) {
  if (m == null) return '';
  final r = m.round();
  return r >= 1000 ? '${(r / 1000).toStringAsFixed(1)} km' : '$r m';
}
