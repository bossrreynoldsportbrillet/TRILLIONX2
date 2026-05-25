(module
    (func $mix (param $n i32) (result i32)
      (local $i i32)(local $x i32)
      (local.set $i (i32.const 0))
      (local.set $x (i32.const 2166136261))
      (loop $loop
        (local.set $x (i32.add (i32.xor (local.get $x) (local.get $i)) (i32.mul (local.get $i) (i32.const 16777619))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br_if $loop (i32.lt_u (local.get $i) (local.get $n))))
      (local.get $x))
    (export "mix" (func $mix)))