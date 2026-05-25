#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <time.h>
#include <string.h>

#if defined(__x86_64__) || defined(_M_X64)
#include <immintrin.h>
#endif

static double now_sec(){
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (double)ts.tv_sec + (double)ts.tv_nsec / 1e9;
}

static void fill_float(float *a, float *b, size_t n){
  for(size_t i=0;i<n;i++){
    a[i] = (float)((i % 1009) * 0.001f);
    b[i] = (float)(((i * 17) % 997) * 0.001f);
  }
}

static double scalar_f32(float *a, float *b, float *c, size_t n, int rounds){
  double t0 = now_sec();
  for(int r=0;r<rounds;r++){
    for(size_t i=0;i<n;i++){
      c[i] = a[i] * 1.0001f + b[i] * 0.9999f + c[i] * 0.000001f;
    }
  }
  return now_sec() - t0;
}

#if defined(__AVX__)
static double avx_f32(float *a, float *b, float *c, size_t n, int rounds){
  __m256 ka = _mm256_set1_ps(1.0001f);
  __m256 kb = _mm256_set1_ps(0.9999f);
  __m256 kc = _mm256_set1_ps(0.000001f);
  double t0 = now_sec();
  for(int r=0;r<rounds;r++){
    size_t i=0;
    for(; i + 8 <= n; i += 8){
      __m256 va = _mm256_loadu_ps(a+i);
      __m256 vb = _mm256_loadu_ps(b+i);
      __m256 vc = _mm256_loadu_ps(c+i);
      __m256 out = _mm256_add_ps(_mm256_mul_ps(va,ka), _mm256_add_ps(_mm256_mul_ps(vb,kb), _mm256_mul_ps(vc,kc)));
      _mm256_storeu_ps(c+i, out);
    }
    for(; i<n; i++) c[i] = a[i] * 1.0001f + b[i] * 0.9999f + c[i] * 0.000001f;
  }
  return now_sec() - t0;
}
#endif

#if defined(__AVX512F__)
static double avx512_f32(float *a, float *b, float *c, size_t n, int rounds){
  __m512 ka = _mm512_set1_ps(1.0001f);
  __m512 kb = _mm512_set1_ps(0.9999f);
  __m512 kc = _mm512_set1_ps(0.000001f);
  double t0 = now_sec();
  for(int r=0;r<rounds;r++){
    size_t i=0;
    for(; i + 16 <= n; i += 16){
      __m512 va = _mm512_loadu_ps(a+i);
      __m512 vb = _mm512_loadu_ps(b+i);
      __m512 vc = _mm512_loadu_ps(c+i);
      __m512 out = _mm512_add_ps(_mm512_mul_ps(va,ka), _mm512_add_ps(_mm512_mul_ps(vb,kb), _mm512_mul_ps(vc,kc)));
      _mm512_storeu_ps(c+i, out);
    }
    for(; i<n; i++) c[i] = a[i] * 1.0001f + b[i] * 0.9999f + c[i] * 0.000001f;
  }
  return now_sec() - t0;
}
#endif

static double checksum(float *c, size_t n){
  double s=0.0;
  size_t step = n / 4096;
  if(step < 1) step = 1;
  for(size_t i=0;i<n;i+=step) s += c[i];
  return s;
}

int main(int argc, char **argv){
  size_t n = 16000000;
  int rounds = 24;
  if(argc > 1) n = (size_t)atoll(argv[1]);
  if(argc > 2) rounds = atoi(argv[2]);

  float *a = NULL, *b = NULL, *c = NULL;
  if(posix_memalign((void**)&a, 64, n * sizeof(float))) return 2;
  if(posix_memalign((void**)&b, 64, n * sizeof(float))) return 3;
  if(posix_memalign((void**)&c, 64, n * sizeof(float))) return 4;

  fill_float(a,b,n);
  memset(c,0,n*sizeof(float));

  double ops = (double)n * (double)rounds * 5.0;

  double t_scalar = scalar_f32(a,b,c,n,rounds);
  double cs_scalar = checksum(c,n);

  fill_float(a,b,n);
  memset(c,0,n*sizeof(float));

  printf("{\n");
  printf("  \"name\":\"TRILLIONX_NATIVE_SIMD_AVX_BENCH\",\n");
  printf("  \"n\":%zu,\n", n);
  printf("  \"rounds\":%d,\n", rounds);
  printf("  \"scalar\":{\"compiled\":true,\"seconds\":%.6f,\"gops\":%.6f,\"checksum\":%.6f},\n", t_scalar, ops/t_scalar/1e9, cs_scalar);

#if defined(__AVX512F__)
  double t512 = avx512_f32(a,b,c,n,rounds);
  double cs512 = checksum(c,n);
  printf("  \"avx512\":{\"compiled\":true,\"seconds\":%.6f,\"gops\":%.6f,\"checksum\":%.6f},\n", t512, ops/t512/1e9, cs512);
#else
  printf("  \"avx512\":{\"compiled\":false,\"reason\":\"compiler flag __AVX512F__ not enabled\"},\n");
#endif

  fill_float(a,b,n);
  memset(c,0,n*sizeof(float));

#if defined(__AVX__)
  double tavx = avx_f32(a,b,c,n,rounds);
  double csavx = checksum(c,n);
  printf("  \"avx\":{\"compiled\":true,\"seconds\":%.6f,\"gops\":%.6f,\"checksum\":%.6f},\n", tavx, ops/tavx/1e9, csavx);
#else
  printf("  \"avx\":{\"compiled\":false,\"reason\":\"compiler flag __AVX__ not enabled\"},\n");
#endif

#if defined(__AVX2__)
  printf("  \"avx2\":{\"compiled\":true,\"note\":\"AVX2 flag enabled; float path uses AVX registers, AVX2 mainly benefits integer/vector extensions\"},\n");
#else
  printf("  \"avx2\":{\"compiled\":false,\"reason\":\"compiler flag __AVX2__ not enabled\"},\n");
#endif

#if defined(__FMA__)
  printf("  \"fma\":{\"compiled\":true},\n");
#else
  printf("  \"fma\":{\"compiled\":false},\n");
#endif

  printf("  \"doctrine\":\"NATIVE_C_SIMD_REAL_EXECUTION_IF_CPU_AND_COMPILER_ALLOW\"\n");
  printf("}\n");

  free(a); free(b); free(c);
  return 0;
}
