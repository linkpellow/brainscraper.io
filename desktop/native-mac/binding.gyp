{
  "targets": [{
    "target_name": "mac_fonts",
    "sources": [ "mac_fonts.mm" ],
    "include_dirs": [ "<!@(node -p \"require('node-addon-api').include\")" ],
    "dependencies": [ "<!(node -p \"require('node-addon-api').gyp\")" ],
    "cflags_cc!": [ "-fno-exceptions" ],
    "cflags_cc": [ "-fexceptions" ],
    "conditions": [
      ["OS=='mac'", {
        "libraries": [
          "-framework AppKit",
          "-framework CoreText",
          "-framework CoreFoundation",
          "-framework Foundation"
        ],
        "xcode_settings": {
          "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
          "CLANG_CXX_LIBRARY": "libc++"
        }
      }]
    ]
  }]
}
