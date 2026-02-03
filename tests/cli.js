// A minimal test for pbjs tool targets.

var tape = require("tape");
var path = require("path");
var Module = require("module");
var protobuf = require("..");
var fs = require("fs");

function cliTest(test, testFunc) {
    // pbjs does not seem to work with Node v4, so skip this test if we're running on it
    if (process.versions.node.match(/^4\./)) {
        test.end();
        return;
    }

    // Alter the require cache to make the cli/targets/static work since it requires "protobufjs"
    // and we don't want to mess with "npm link"
    var savedResolveFilename = Module._resolveFilename;
    Module._resolveFilename = function(request, parent) { 
      if (request.startsWith("protobufjs")) {
        return request;
      }
      return savedResolveFilename(request, parent);
    };
    require.cache.protobufjs = require.cache[path.resolve("index.js")];

    try {
        testFunc();
    } finally {
        // Rollback all the require() related mess we made
        delete require.cache.protobufjs;
        Module._resolveFilename = savedResolveFilename;
    }
}

tape.test("pbjs generates static code", function(test) {
    cliTest(test, function() {
        var root = protobuf.loadSync("tests/data/cli/test.proto");
        root.resolveAll();

        var staticTarget = require("../cli/targets/static");

        staticTarget(root, {
            create: true,
            decode: true,
            encode: true,
            convert: true,
            typeurl: true,
        }, function(err, jsCode) {
            test.error(err, 'static code generation worked');

            // jsCode is the generated code; we'll eval it
            // (since this is what we normally do with the code, right?)
            // This is a test code. Do not use this in production.
            var $protobuf = protobuf;
            eval(jsCode);

            var OneofContainer = protobuf.roots.default.OneofContainer;
            var Message = protobuf.roots.default.Message;
            test.ok(OneofContainer, "type is loaded");
            test.ok(Message, "type is loaded");

            // Check that fromObject and toObject work for plain object
            var obj = {
                messageInOneof: {
                    value: 42,
                },
                regularField: "abc",
                enumField: 0,
            };
            var obj1 = OneofContainer.toObject(OneofContainer.fromObject(obj));
            test.deepEqual(obj, obj1, "fromObject and toObject work for plain object");

            // Check that dynamic fromObject and toObject work for static instance
            var root = protobuf.loadSync("tests/data/cli/test.proto");
            var OneofContainerDynamic = root.lookup("OneofContainer");
            var instance = new OneofContainer();
            instance.messageInOneof = new Message();
            instance.messageInOneof.value = 42;
            instance.regularField = "abc";
            instance.enumField = 0;
            var instance1 = OneofContainerDynamic.toObject(OneofContainerDynamic.fromObject(instance));
            test.deepEqual(instance, instance1, "fromObject and toObject work for instance of the static type");

            // Check that getTypeUrl works
            var defaultTypeUrl = Message.getTypeUrl();
            var customTypeUrl = Message.getTypeUrl("example.com");
            test.equal(defaultTypeUrl, "type.googleapis.com/Message", "getTypeUrl returns expected url");
            test.equal(customTypeUrl, "example.com/Message", "getTypeUrl returns custom url");

            test.end();
        });
    });
});

tape.test("without null-defaults, absent optional fields have zero values", function(test) {
    cliTest(test, function() {
        var root = protobuf.loadSync("tests/data/cli/null-defaults.proto");
        root.resolveAll();

        var staticTarget = require("../cli/targets/static");

        staticTarget(root, {
            create: true,
            decode: true,
            encode: true,
            convert: true,
        }, function(err, jsCode) {
            test.error(err, 'static code generation worked');

            // jsCode is the generated code; we'll eval it
            // (since this is what we normally does with the code, right?)
            // This is a test code. Do not use this in production.
            var $protobuf = protobuf;
            eval(jsCode);

            var OptionalFields = protobuf.roots.default.OptionalFields;
            test.ok(OptionalFields, "type is loaded");

            // Check default values
            var msg = OptionalFields.fromObject({});
            test.equal(msg.a, null, "default submessage is null");
            test.equal(msg.b, "", "default string is empty");
            test.equal(msg.c, 0, "default integer is 0");

            test.end();
        });
    });
});

tape.test("with null-defaults, absent optional fields have null values", function(test) {
    cliTest(test, function() {
        var root = protobuf.loadSync("tests/data/cli/null-defaults.proto");
        root.resolveAll();

        var staticTarget = require("../cli/targets/static");

        staticTarget(root, {
            create: true,
            decode: true,
            encode: true,
            convert: true,
            "null-defaults": true,
        }, function(err, jsCode) {
            test.error(err, 'static code generation worked');

            // jsCode is the generated code; we'll eval it
            // (since this is what we normally does with the code, right?)
            // This is a test code. Do not use this in production.
            var $protobuf = protobuf;
            eval(jsCode);

            var OptionalFields = protobuf.roots.default.OptionalFields;
            test.ok(OptionalFields, "type is loaded");

            // Check default values
            var msg = OptionalFields.fromObject({});
            test.equal(msg.a, null, "default submessage is null");
            test.equal(msg.b, null, "default string is null");
            test.equal(msg.c, null, "default integer is null");

            test.end();
        });
    });
});


tape.test("with --null-semantics, optional fields are handled correctly in proto2", function(test) {
    cliTest(test, function() {
        var root = protobuf.loadSync("tests/data/cli/null-defaults.proto");
        root.resolveAll();

        var staticTarget = require("../cli/targets/static");

        staticTarget(root, {
            create: true,
            decode: true,
            encode: true,
            convert: true,
            comments: true,
            "null-semantics": true,
        }, function(err, jsCode) {

            test.error(err, 'static code generation worked');

            test.ok(jsCode.includes("@property {OptionalFields.ISubMessage|null|undefined} [a] OptionalFields a"), "Property for a should use an interface")
            test.ok(jsCode.includes("@member {OptionalFields.SubMessage|null} a"), "Member for a should use a message type")
            test.ok(jsCode.includes("OptionalFields.prototype.a = null;"), "Initializer for a should be null")

            test.ok(jsCode.includes("@property {number|null|undefined} [c] OptionalFields c"), "Property for c should be nullable")
            test.ok(jsCode.includes("@member {number|null} c"), "Member for c should be nullable")
            test.ok(jsCode.includes("OptionalFields.prototype.c = null;"), "Initializer for c should be null")

            test.ok(jsCode.includes("@property {number} d OptionalFields d"), "Property for d should not be nullable")
            test.ok(jsCode.includes("@member {number} d"), "Member for d should not be nullable")
            test.ok(jsCode.includes("OptionalFields.prototype.d = 0;"), "Initializer for d should be zero")

            test.end();
        });
    });
});


tape.test("with --null-semantics, optional fields are handled correctly in proto3", function(test) {
    cliTest(test, function() {
        var root = protobuf.loadSync("tests/data/cli/null-defaults-proto3.proto");
        root.resolveAll();

        var staticTarget = require("../cli/targets/static");

        staticTarget(root, {
            create: true,
            decode: true,
            encode: true,
            convert: true,
            comments: true,
            "null-semantics": true,
        }, function(err, jsCode) {

            test.error(err, 'static code generation worked');

            test.ok(jsCode.includes("@property {OptionalFields.ISubMessage|null|undefined} [a] OptionalFields a"), "Property for a should use an interface")
            test.ok(jsCode.includes("@member {OptionalFields.SubMessage|null} a"), "Member for a should use a message type")
            test.ok(jsCode.includes("OptionalFields.prototype.a = null;"), "Initializer for a should be null")

            test.ok(jsCode.includes("@property {number|null|undefined} [c] OptionalFields c"), "Property for c should be nullable")
            test.ok(jsCode.includes("@member {number|null} c"), "Member for c should be nullable")
            test.ok(jsCode.includes("OptionalFields.prototype.c = null;"), "Initializer for c should be null")

            test.ok(jsCode.includes("@property {number|undefined} [d] OptionalFields d"), "Property for d should be optional but not nullable")
            test.ok(jsCode.includes("@member {number} d"), "Member for d should not be nullable")
            test.ok(jsCode.includes("OptionalFields.prototype.d = 0;"), "Initializer for d should be zero")

            test.end();
        });
    });
});

tape.test("with --null-semantics, optional fields are handled correctly in editions", function(test) {
    cliTest(test, function() {
        var root = protobuf.loadSync("tests/data/cli/null-defaults-edition2023.proto");
        root.resolveAll();

        var staticTarget = require("../cli/targets/static");

        staticTarget(root, {
            create: true,
            decode: true,
            encode: true,
            convert: true,
            comments: true,
            "null-semantics": true,
        }, function(err, jsCode) {

            test.error(err, 'static code generation worked');

            test.ok(jsCode.includes("@property {OptionalFields.ISubMessage|null|undefined} [a] OptionalFields a"), "Property for a should use an interface")
            test.ok(jsCode.includes("@member {OptionalFields.SubMessage|null} a"), "Member for a should use a message type")
            test.ok(jsCode.includes("OptionalFields.prototype.a = null;"), "Initializer for a should be null")

            test.ok(jsCode.includes("@property {string|null|undefined} [e] OptionalFields e"), "Property for e should be nullable")
            test.ok(jsCode.includes("@member {string|null} e"), "Member for e should be nullable")
            test.ok(jsCode.includes("OptionalFields.prototype.e = null;"), "Initializer for e should be null")

            test.ok(jsCode.includes("@property {number} r OptionalFields r"), "Property for r should not be nullable")
            test.ok(jsCode.includes("@member {number} r"), "Member for r should not be nullable")
            test.ok(jsCode.includes("OptionalFields.prototype.r = 0;"), "Initializer for r should be zero")

            test.ok(jsCode.includes("@property {number|undefined} [i] OptionalFields i"), "Property for i should be optional but not nullable")
            test.ok(jsCode.includes("@member {number} i"), "Member for i should not be nullable")
            test.ok(jsCode.includes("OptionalFields.prototype.i = 0;"), "Initializer for i should be zero")

            test.end();
        });
    });
});


tape.test("pbjs generates static code with message filter", function (test) {
    cliTest(test, function () {
        var root = protobuf.loadSync("tests/data/cli/test-filter.proto");
        root.resolveAll();

        var staticTarget = require("../cli/targets/static");
        var util = require("../cli/util");

        const needMessageConfig = JSON.parse(fs.readFileSync("tests/data/cli/filter.json"));

        util.filterMessage(root, needMessageConfig);

        staticTarget(root, {
            create: true,
            decode: true,
            encode: true,
            convert: true,
            "null-defaults": true,
        }, function (err, jsCode) {
            test.error(err, 'static code generation worked');

            // jsCode is the generated code; we'll eval it
            // (since this is what we normally does with the code, right?)
            // This is a test code. Do not use this in production.
            var $protobuf = protobuf;
            eval(jsCode);

            var NeedMessage1 = protobuf.roots.default.filtertest.NeedMessage1;
            var NeedMessage2 = protobuf.roots.default.filtertest.NeedMessage2;
            var DependentMessage1 = protobuf.roots.default.filtertest.DependentMessage1;
            var DependentMessageFromImport = protobuf.roots.default.DependentMessageFromImport;

            var NotNeedMessageInRootFile = protobuf.roots.default.filtertest.NotNeedMessageInRootFile;
            var NotNeedMessageInImportFile = protobuf.roots.default.NotNeedMessageInImportFile;

            test.ok(NeedMessage1, "NeedMessage1 is loaded");
            test.ok(NeedMessage2, "NeedMessage2 is loaded");
            test.ok(DependentMessage1, "DependentMessage1 is loaded");
            test.ok(DependentMessageFromImport, "DependentMessageFromImport is loaded");

            test.notOk(NotNeedMessageInImportFile, "NotNeedMessageInImportFile is not loaded");
            test.notOk(NotNeedMessageInRootFile, "NotNeedMessageInRootFile is not loaded");

            test.end();
        });
    });
});

tape.test("proto3 roundtrip", function(test) {
    const proto = `syntax = "proto3";

message OptionalFields {

    optional SubMessage a = 1;
    optional string b = 2;
    repeated uint32 c = 3 [packed=false];
    uint32 d = 4;

    message SubMessage {

        string a = 1;
    }
}`;
    cliTest(test, function() {
        var root = protobuf.parse(proto).root.resolveAll();
        var protoTarget = require("../cli/targets/proto3");

        protoTarget(root, {}, function(err, output) {
            test.error(err, 'proto code generation worked');

            test.equal(output, proto);

            test.end();
        });
    });
});

tape.test("proto2 roundtrip", function(test) {
    const proto = `syntax = "proto2";

message OptionalFields {

    optional OptionalFields a = 1;
    required string b = 2;
    repeated uint32 c = 3 [packed=true];
    optional float d = 4 [default=0.1];
    optional group OptionalGroup = 5 {

        optional string a = 1;
    }
    repeated group RepeatedGroup = 6 {

        optional string a = 1;
    }
    required group RequiredGroup = 7 {

        optional string a = 1;
    }
}`;
    cliTest(test, function() {
        var root = protobuf.parse(proto).root.resolveAll();
        var protoTarget = require("../cli/targets/proto2");

        protoTarget(root, {}, function(err, output) {
            test.error(err, 'proto code generation worked');

            test.equal(output, proto);

            test.end();
        });
    });
});

tape.test("proto3 to proto2 valid", function(test) {
    const proto3 = `syntax = "proto3";

message OptionalFields {
    message SubMessage {
        optional string a = 1;
    }

    optional SubMessage a = 1;
    repeated int32 b = 2;
    repeated uint32 c = 3 [packed=false];

}`;
    const proto2 = `syntax = "proto2";

message OptionalFields {

    optional SubMessage a = 1;
    repeated int32 b = 2 [packed=true];
    repeated uint32 c = 3;

    message SubMessage {

        optional string a = 1;
    }
}`;
    cliTest(test, function() {
        var root = protobuf.parse(proto3).root.resolveAll();
        var protoTarget = require("../cli/targets/proto2");

        protoTarget(root, {}, function(err, output) {
            test.error(err, 'proto code generation worked');

            test.equal(output, proto2);

            test.end();
        });
    });
});

tape.test("proto2 to proto3 valid", function(test) {
    const proto2 = `syntax = "proto2";

message OptionalFields {
    message SubMessage {
        optional string a = 1;
    }

    optional SubMessage a = 1;
    repeated int32 b = 2;
    repeated uint32 c = 3 [packed=true];
}`;
    const proto3 = `syntax = "proto3";

message OptionalFields {

    optional SubMessage a = 1;
    repeated int32 b = 2 [packed=false];
    repeated uint32 c = 3;

    message SubMessage {

        optional string a = 1;
    }
}`;
    cliTest(test, function() {
        var root = protobuf.parse(proto2).root.resolveAll();
        var protoTarget = require("../cli/targets/proto3");

        protoTarget(root, {}, function(err, output) {
            test.error(err, 'proto code generation worked');

            test.equal(output, proto3);

            test.end();
        });
    });
});


tape.test("edition 2023 to proto2 valid", function(test) {
    const editions = `edition = "2023";
option features.repeated_field_encoding = EXPANDED;

message OptionalFields {
    message SubMessage {
        string a = 1 [features.field_presence = LEGACY_REQUIRED];
    }

    SubMessage a = 1;
    repeated int32 b = 2 [features.repeated_field_encoding = PACKED];
    repeated uint32 c = 3;
}`;
    const proto2 = `syntax = "proto2";

message OptionalFields {

    optional SubMessage a = 1;
    repeated int32 b = 2 [packed=true];
    repeated uint32 c = 3;

    message SubMessage {

        required string a = 1;
    }
}`;
    cliTest(test, function() {
        var root = protobuf.parse(editions).root.resolveAll();
        var protoTarget = require("../cli/targets/proto2");

        protoTarget(root, {}, function(err, output) {
            test.error(err, 'proto code generation worked');

            test.equal(output, proto2);

            test.end();
        });
    });
});

tape.test("edition 2023 to proto3 valid", function(test) {
    const editions = `edition = "2023";
option features.repeated_field_encoding = EXPANDED;

message OptionalFields {
    message SubMessage {
        string a = 1 [features.field_presence = IMPLICIT];
    }

    SubMessage a = 1;
    repeated int32 b = 2 [features.repeated_field_encoding = PACKED];
    repeated uint32 c = 3;
}`;
    const proto3 = `syntax = "proto3";

message OptionalFields {

    optional SubMessage a = 1;
    repeated int32 b = 2;
    repeated uint32 c = 3 [packed=false];

    message SubMessage {

        string a = 1;
    }
}`;
    cliTest(test, function() {
        var root = protobuf.parse(editions).root.resolveAll();
        var protoTarget = require("../cli/targets/proto3");

        protoTarget(root, {}, function(err, output) {
            test.error(err, 'proto code generation worked');

            test.equal(output, proto3);

            test.end();
        });
    });
});

tape.test("pbts generates .d.ts with I prefix for interfaces", function(test) {
    cliTest(test, function() {
        var root = protobuf.loadSync("tests/data/cli/test.proto");
        root.resolveAll();

        var staticTarget = require("../cli/targets/static");

        staticTarget(root, {
            create: true,
            decode: true,
            encode: true,
            convert: true,
            comments: true,
        }, function(err, jsCode) {
            test.error(err, 'static code generation worked');

            // Write the generated JS to a temporary file
            var os = require("os");
            var tmpFile = path.join(os.tmpdir(), "pbts-test-" + Date.now() + ".js");
            fs.writeFileSync(tmpFile, jsCode);

            // Run pbts to generate .d.ts
            var pbts = require("../cli/pbts");
            pbts.main([tmpFile], function(err, dtsCode) {
                // Clean up temp file
                try { fs.unlinkSync(tmpFile); } catch(e) {/**/}

                test.error(err, 'pbts generation worked');

                // Verify that interfaces use I prefix
                test.ok(dtsCode.includes("interface IMessage"), "interface should use I prefix (IMessage)");
                // OneofContainer is a class that implements an interface
                test.ok(dtsCode.includes("implements IOneofContainer"), "class should implement I-prefixed interface (IOneofContainer)");
                test.ok(dtsCode.includes("implements IMessage"), "class should implement I-prefixed interface (IMessage)");

                // Verify that type references also use I prefix
                test.ok(/IMessage/.test(dtsCode), "type references should use I prefix");

                test.end();
            });
        });
    });
});

tape.test("with --strict-types in proto2, explicit optional fields are nullable, required fields are exact", function(test) {
    cliTest(test, function() {
        var root = protobuf.loadSync("tests/data/cli/null-defaults.proto");
        root.resolveAll();

        var staticTarget = require("../cli/targets/static");

        staticTarget(root, {
            create: true,
            decode: true,
            encode: true,
            convert: true,
            comments: true,
            "strict-types": true,
        }, function(err, jsCode) {
            test.error(err, 'static code generation worked');

            // Property 'a' (optional submessage) should be optional with |null
            test.ok(jsCode.includes("@property {OptionalFields.ISubMessage|null} [a] OptionalFields a"), "Property for a should be optional with |null");
            
            // Property 'b' (optional string) should be optional with |null
            test.ok(jsCode.includes("@property {string|null} [b] OptionalFields b"), "Property for b should be optional with |null");
            
            // Property 'c' (optional number) should be optional with |null
            test.ok(jsCode.includes("@property {number|null} [c] OptionalFields c"), "Property for c should be optional with |null");
            
            // Property 'd' (required number) should be required with exact type
            test.ok(jsCode.includes("@property {number} d OptionalFields d"), "Property for d should be required with exact type");

            test.end();
        });
    });
});

tape.test("with --strict-types in proto3, explicit optional fields are nullable, implicit fields are exact", function(test) {
    cliTest(test, function() {
        var root = protobuf.loadSync("tests/data/cli/null-defaults-proto3.proto");
        root.resolveAll();

        var staticTarget = require("../cli/targets/static");

        staticTarget(root, {
            create: true,
            decode: true,
            encode: true,
            convert: true,
            comments: true,
            "strict-types": true,
        }, function(err, jsCode) {
            test.error(err, 'static code generation worked');

            // Property 'a' (explicit optional submessage) should be optional with |null
            test.ok(jsCode.includes("@property {OptionalFields.ISubMessage|null} [a] OptionalFields a"), "Property for a should be optional with |null");
            
            // Property 'b' (explicit optional string) should be optional with |null
            test.ok(jsCode.includes("@property {string|null} [b] OptionalFields b"), "Property for b should be optional with |null");
            
            // Property 'c' (explicit optional number) should be optional with |null
            test.ok(jsCode.includes("@property {number|null} [c] OptionalFields c"), "Property for c should be optional with |null");
            
            // Property 'd' (implicit number, no optional keyword) should be required with exact type
            test.ok(jsCode.includes("@property {number} d OptionalFields d"), "Property for d should be required with exact type");

            test.end();
        });
    });
});
