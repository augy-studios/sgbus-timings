// The uwuCoin: gold, with "uwu" on it, drawn as the site's icon is (main-site/js/icons.js, coin).
import 'package:flutter/material.dart';

class CoinIcon extends StatelessWidget {
  const CoinIcon({super.key, this.size = 24});
  final double size;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: CustomPaint(size: Size.square(size), painter: const _CoinPainter()),
      );
}

class _CoinPainter extends CustomPainter {
  const _CoinPainter();

  @override
  void paint(Canvas canvas, Size size) {
    // In the icon's own 24 by 24.
    canvas.scale(size.width / 24);
    const middle = Offset(12, 12);
    canvas.drawCircle(middle, 10.5, Paint()..color = const Color(0xFFF5C542));
    canvas.drawCircle(middle, 10.5, Paint()..color = const Color(0xFFB8860B)..style = PaintingStyle.stroke..strokeWidth = 1.5);
    canvas.drawCircle(middle, 7.6, Paint()..color = const Color(0xFFD9A520)..style = PaintingStyle.stroke..strokeWidth = 1);
    final word = TextPainter(
      text: const TextSpan(text: 'uwu', style: TextStyle(fontSize: 7.2, fontWeight: FontWeight.w800, color: Color(0xFF7A5200), fontFamily: 'sans-serif', height: 1)),
      textDirection: TextDirection.ltr,
    )..layout();
    word.paint(canvas, middle - Offset(word.width / 2, word.height / 2));
    word.dispose();
  }

  @override
  bool shouldRepaint(_CoinPainter old) => false;
}
