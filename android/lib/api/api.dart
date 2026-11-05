// The site's own API (main-site/api/), which the app reads just as the site did: LTA's bus
// arrivals, stops and routes, Navigate, the weather, Service Alerts and the rest, all through
// sgbus.uwuapps.org so LTA's key stays on the server.
import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

class ApiError implements Exception {
  ApiError(this.message, {this.status});
  final String message;
  final int? status;
  @override
  String toString() => message;
}

class Api {
  Api._();

  static const site = 'https://sgbus.uwuapps.org';
  static http.Client client = http.Client();

  /// What a test or screenshot answers instead of the network: path (with query) to JSON.
  static Future<Object?> Function(String path)? fake;

  static Uri uri(String path, [Map<String, Object?>? query]) {
    final q = <String, String>{};
    query?.forEach((k, v) {
      if (v != null && '$v'.isNotEmpty) q[k] = '$v';
    });
    return Uri.parse('$site/api/$path').replace(queryParameters: q.isEmpty ? null : q);
  }

  static Future<Object?> get(String path, {Map<String, Object?>? query, Duration timeout = const Duration(seconds: 20)}) async {
    final u = uri(path, query);
    if (fake != null) return fake!(u.toString().substring('$site/api/'.length));
    final r = await client.get(u, headers: const {'accept': 'application/json'}).timeout(timeout);
    return _read(r);
  }

  static Future<Object?> post(String path, Object? body, {Map<String, Object?>? query, Duration timeout = const Duration(seconds: 20)}) async {
    final u = uri(path, query);
    if (fake != null) return fake!(u.toString().substring('$site/api/'.length));
    final r = await client
        .post(u, headers: const {'accept': 'application/json', 'content-type': 'application/json'}, body: jsonEncode(body))
        .timeout(timeout);
    return _read(r);
  }

  static Object? _read(http.Response r) {
    Object? data;
    try {
      data = r.body.isEmpty ? null : jsonDecode(utf8.decode(r.bodyBytes));
    } catch (_) {
      data = null;
    }
    if (r.statusCode >= 400) {
      final msg = data is Map && data['error'] is String ? data['error'] as String : 'The server replied ${r.statusCode}';
      throw ApiError(msg, status: r.statusCode);
    }
    return data;
  }

  static Future<Map<String, dynamic>> map(String path, {Map<String, Object?>? query}) async {
    final v = await get(path, query: query);
    return v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
  }
}
