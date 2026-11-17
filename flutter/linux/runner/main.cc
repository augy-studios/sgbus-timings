// SG Bus Timings for Linux: where the program starts. Everything else is in my_application.cc.
#include "my_application.h"

// Makes the app and runs it until it quits. A second copy hands its command line to the first
// and returns straight away (my_application.cc).
int main(int argc, char** argv) {
  g_autoptr(MyApplication) app = my_application_new();
  return g_application_run(G_APPLICATION(app), argc, argv);
}
