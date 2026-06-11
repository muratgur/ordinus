# Mascot source renders (ADR-038)

Kaynak karakter görselleri burada yaşar. Bu klasör gitignore'dadır (bu README hariç) —
uygulamaya yalnızca üretilen WebP'ler girer.

## Yeni görsel ekleme / değiştirme

1. Görseli **saydam arka planlı PNG** olarak buraya koy:
   - Mevcut karakteri değiştir → aynı numaranın üzerine yaz (`3.png`)
   - Yeni karakter ekle → sıradaki numarayı ver (`13.png`)
   - `Base.png` = varyant 0 (kıyafetsiz temel karakter)
2. Üret:

   ```bash
   cd app && npm run mascots:build
   ```

3. `app/src/renderer/src/assets/mascots/` altındaki üretilen `.webp` dosyalarını commit'le.

Kod değişikliği gerekmez — yeni numara picker'a kendiliğinden düşer.

## Kurallar

- Arka planı saydam olmayan dosya işlenmez (script uyarı basar).
- Yayınlanmış bir numarayı silip başka karaktere geri verme: o numarayı
  kullanan eski agent'lar Base'e düşer. Değiştirmek istiyorsan üzerine yaz.
- Kadraj standart: aynı baş hizası, aynı omuz kesimi, aynı boşluk (Base şablondur).
