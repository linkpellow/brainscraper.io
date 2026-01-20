/**
 * macOS native addon: NSScreen backingScaleFactor, CoreText glyph metrics,
 * NSLocale, NSTimeZone, and HW_MEMSIZE for font/rendering parity and fingerprint alignment.
 * N-API (node-addon-api). macOS only.
 */

#include <napi.h>
#import <AppKit/AppKit.h>
#import <CoreText/CoreText.h>
#import <CoreFoundation/CoreFoundation.h>
#include <sys/sysctl.h>
#include <sys/types.h>

// HW_MEMSIZE (bytes) on 64-bit darwin
#ifndef HW_MEMSIZE
#define HW_MEMSIZE 24
#endif

static Napi::Value GetBackingScaleFactor(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  @autoreleasepool {
    NSScreen* main = [NSScreen mainScreen];
    if (!main) return Napi::Number::New(env, 2.0);
    CGFloat scale = [main backingScaleFactor];
    return Napi::Number::New(env, (double)scale);
  }
}

static Napi::Value GetGlyphMetrics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 3 || !info[0].IsString() || !info[1].IsNumber() || !info[2].IsString()) {
    Napi::Object out = Napi::Object::New(env);
    out.Set("width", Napi::Number::New(env, 0));
    out.Set("ok", Napi::Boolean::New(env, false));
    return out;
  }
  std::string fontName = info[0].As<Napi::String>().Utf8Value();
  double fontSize = info[1].As<Napi::Number>().DoubleValue();
  std::string text = info[2].As<Napi::String>().Utf8Value();
  @autoreleasepool {
    NSString* nsFont = [NSString stringWithUTF8String:fontName.c_str()];
    NSString* nsText = [NSString stringWithUTF8String:text.c_str()];
    CTFontRef font = CTFontCreateWithName((__bridge CFStringRef)nsFont, (CGFloat)fontSize, NULL);
    if (!font) {
      Napi::Object out = Napi::Object::New(env);
      out.Set("width", Napi::Number::New(env, 0));
      out.Set("ok", Napi::Boolean::New(env, false));
      return out;
    }
    NSDictionary* attrs = @{ (__bridge NSString*)kCTFontAttributeName: (__bridge id)font };
    NSAttributedString* attr = [[NSAttributedString alloc] initWithString:nsText attributes:attrs];
    CTLineRef line = CTLineCreateWithAttributedString((__bridge CFAttributedStringRef)attr);
    double ascent = 0, descent = 0, leading = 0;
    double width = CTLineGetTypographicBounds(line, &ascent, &descent, &leading);
    CFRelease(line);
    CFRelease(font);
    Napi::Object out = Napi::Object::New(env);
    out.Set("width", Napi::Number::New(env, width));
    out.Set("ascent", Napi::Number::New(env, ascent));
    out.Set("descent", Napi::Number::New(env, descent));
    out.Set("ok", Napi::Boolean::New(env, true));
    return out;
  }
}

static Napi::Value GetLocale(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  @autoreleasepool {
    NSString* ident = [[NSLocale currentLocale] localeIdentifier];
    if (!ident) return Napi::String::New(env, "en-US");
    std::string s = [ident UTF8String];
    for (size_t i = 0; i < s.size(); i++) if (s[i] == '_') s[i] = '-';
    return Napi::String::New(env, s);
  }
}

static Napi::Value GetTimezone(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  @autoreleasepool {
    NSString* name = [[NSTimeZone localTimeZone] name];
    if (!name) return Napi::String::New(env, "America/Los_Angeles");
    return Napi::String::New(env, [name UTF8String]);
  }
}

static Napi::Value GetDeviceMemory(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  int64_t mem = 0;
  size_t len = sizeof(mem);
  int mib[2] = { CTL_HW, HW_MEMSIZE };
  if (sysctl(mib, 2, &mem, &len, NULL, 0) != 0) {
    return Napi::Number::New(env, 8); // fallback 8 GB
  }
  int gb = (int)((mem + (1024*1024*1024) - 1) / (1024*1024*1024));
  if (gb < 4) gb = 4;
  if (gb > 64) gb = 64;
  return Napi::Number::New(env, gb);
}

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("getBackingScaleFactor", Napi::Function::New(env, GetBackingScaleFactor));
  exports.Set("getGlyphMetrics", Napi::Function::New(env, GetGlyphMetrics));
  exports.Set("getLocale", Napi::Function::New(env, GetLocale));
  exports.Set("getTimezone", Napi::Function::New(env, GetTimezone));
  exports.Set("getDeviceMemory", Napi::Function::New(env, GetDeviceMemory));
  return exports;
}

NODE_API_MODULE(mac_fonts, Init)
