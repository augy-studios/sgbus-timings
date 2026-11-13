cmake_minimum_required(VERSION 3.14)
set(PROJECT_NAME "sgbus_desktop")
project(${PROJECT_NAME} LANGUAGES CXX)

set(PLUGIN_NAME "sgbus_desktop_plugin")

add_library(${PLUGIN_NAME} SHARED
  "sgbus_desktop_plugin.cpp"
)
apply_standard_settings(${PLUGIN_NAME})
set_target_properties(${PLUGIN_NAME} PROPERTIES CXX_VISIBILITY_PRESET hidden)
target_compile_definitions(${PLUGIN_NAME} PRIVATE FLUTTER_PLUGIN_IMPL)
target_include_directories(${PLUGIN_NAME} INTERFACE "${CMAKE_CURRENT_SOURCE_DIR}/include")
target_link_libraries(${PLUGIN_NAME} PRIVATE flutter flutter_wrapper_plugin propsys shell32 ole32)

set(sgbus_desktop_bundled_libraries "" PARENT_SCOPE)
